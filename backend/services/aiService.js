/**
 * FinWise AI Service — Multi-Provider with Fallback
 * Supports: OpenRouter (free), OpenAI GPT-4, Google Gemini, Anthropic Claude
 * Priority: OpenRouter → Gemini → OpenAI → Claude
 */

const https = require('https');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS, 10) || 1500;
const CTX_MSGS = parseInt(process.env.AI_CONTEXT_MESSAGES, 10) || 14;

// Initialize AI clients
let openai = null;
let gemini = null;

if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('REPLACE')) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('REPLACE')) {
  gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. OpenRouter API (FREE models available)
// ─────────────────────────────────────────────────────────────────────────────
function callOpenRouter(userMessage, systemPrompt, maxTokens = MAX_TOKENS) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return reject(new Error('OPENROUTER_API_KEY not set'));

    const body = JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'openrouter/free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: maxTokens,
      temperature: 0.7
    });

    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-powered-financial-website.onrender.com',
        'X-Title': 'FinWise AI',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) return reject(new Error(`OpenRouter: ${parsed.error.message || JSON.stringify(parsed.error)}`));
          const text = parsed.choices?.[0]?.message?.content;
          if (text) return resolve(text);
          reject(new Error('Empty OpenRouter response'));
        } catch (e) {
          reject(new Error('Could not parse OpenRouter response: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. Multi-Provider AI Call with Fallback
// ─────────────────────────────────────────────────────────────────────────────
async function callAI(messages, systemPrompt, maxTokens = MAX_TOKENS, requiresJSON = false) {
  const errors = [];
  const userMessage = typeof messages === 'string' ? messages : (messages[messages.length - 1]?.content || '');

  // Skip Ollama in production or for JSON calls
  const useOllama = process.env.NODE_ENV !== 'production' && process.env.USE_OLLAMA !== 'false' && !requiresJSON;
  if (useOllama) {
    try {
      console.log('[AI] Trying Ollama...');
      const result = await callOllama(userMessage, systemPrompt, maxTokens);
      console.log('[AI] ✓ Ollama succeeded');
      return result;
    } catch (e) {
      errors.push(`Ollama: ${e.message}`);
      console.log('[AI] ✗ Ollama failed:', e.message);
    }
  }

  // Try OpenRouter first (FREE models available)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      console.log('[AI] Trying OpenRouter...');
      const result = await callOpenRouter(userMessage, systemPrompt, maxTokens);
      console.log('[AI] ✓ OpenRouter succeeded');
      return result;
    } catch (e) {
      errors.push(`OpenRouter: ${e.message}`);
      console.log('[AI] ✗ OpenRouter failed:', e.message);
    }
  }

  // Try Claude (best for structured JSON)
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  if (anthropicKey && !anthropicKey.includes('REPLACE')) {
    try {
      console.log('[AI] Trying Anthropic Claude...');
      const response = await callClaude(messages, systemPrompt, maxTokens);
      console.log('[AI] ✓ Claude succeeded');
      return response;
    } catch (e) {
      errors.push(`Claude: ${e.message}`);
      console.log('[AI] ✗ Claude failed:', e.message);
    }
  }

  // Try Gemini second
  if (gemini) {
    try {
      console.log('[AI] Trying Google Gemini...');
      const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`;
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
      });
      console.log('[AI] ✓ Gemini succeeded');
      return result.response.text();
    } catch (e) {
      errors.push(`Gemini: ${e.message}`);
      console.log('[AI] ✗ Gemini failed:', e.message);
    }
  }

  // Try OpenAI last
  if (openai) {
    try {
      console.log('[AI] Trying OpenAI...');
      const formattedMsgs = typeof messages === 'string' 
        ? [{ role: 'user', content: messages }] 
        : messages;

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...formattedMsgs],
        max_tokens: maxTokens,
        temperature: 0.7
      });
      console.log('[AI] ✓ OpenAI succeeded');
      return response.choices[0].message.content;
    } catch (e) {
      errors.push(`OpenAI: ${e.message}`);
      console.log('[AI] ✗ OpenAI failed:', e.message);
    }
  }

  // Try Hugging Face as final API fallback
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (hfKey && !hfKey.includes('REPLACE')) {
    try {
      console.log('[AI] Trying Hugging Face...');
      const result = await callHuggingFace(hfKey, `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`, maxTokens);
      console.log('[AI] ✓ Hugging Face succeeded');
      return result;
    } catch (e) {
      errors.push(`HuggingFace: ${e.message}`);
      console.log('[AI] ✗ Hugging Face failed:', e.message);
    }
  }

  // Fallback to Mock Response if non-JSON
  if (!requiresJSON) {
    console.log('[AI] Falling back to Mock AI');
    return getMockAIResponse(userMessage, systemPrompt);
  }

  throw new Error(`All AI providers failed. Check your API keys in Render Environment settings.\n${errors.join('\n')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. Ollama API (Local AI)
// ─────────────────────────────────────────────────────────────────────────────
function callOllama(userMessage, systemPrompt, maxTokens = MAX_TOKENS) {
  return new Promise((resolve, reject) => {
    const prompt = `${systemPrompt}\n\nUser: ${userMessage}\n\nAssistant:`;
    
    const body = JSON.stringify({
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      prompt: prompt,
      stream: false,
      options: {
        num_predict: maxTokens,
        temperature: 0.7
      }
    });

    const req = https.request({
      hostname: 'localhost',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) return reject(new Error(`Ollama: ${parsed.error}`));
          if (parsed.response) return resolve(parsed.response);
          reject(new Error('Unexpected Ollama response format'));
        } catch (e) {
          reject(new Error('Could not parse Ollama response: ' + e.message));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Ollama not running. Start it with: ollama serve`));
    });
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Ollama timed out (model might be loading)'));
    });
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  4. Mock AI (Fallback)
// ─────────────────────────────────────────────────────────────────────────────
function getMockAIResponse(userMessage, systemPrompt) {
  const msg = userMessage.toLowerCase();
  
  if (msg.match(/^(hello|hi|hey|good morning|good evening|namaste)[\s!?]*$/i)) {
    return "Hello! I'm FinWise AI, your personal financial advisor for India. How can I help you manage your finances today?\n\n**Next step:** Tell me about your current financial situation or ask me a specific question about managing your money.";
  }
  
  if (msg.match(/reduce.*expense|cut.*cost|lower.*spending|decrease.*expense/)) {
    return "Here are practical ways to reduce your expenses:\n\n**Immediate Actions:**\n1. Cancel unused subscriptions\n2. Cook at home instead of ordering food\n3. Use public transport or carpool\n\n**Next step:** Identify your top 3 expense categories and find one way to reduce each by 10-20%.";
  }

  if (msg.match(/cash.*flow|money.*flow|forecast/)) {
    return "Based on recent trends, your expected monthly income and expense coverage show a healthy reserve margin for the next 30 days.\n\n**Next step:** Monitor your recurring bills regularly in the dashboard.";
  }

  return "I've analyzed your financial query. Maintaining a close eye on discretionary spending and keeping a 3-to-6 month emergency buffer is recommended.\n\n**Next step:** Check your latest spending analytics category by category.";
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. Hugging Face API
// ─────────────────────────────────────────────────────────────────────────────
function callHuggingFace(apiKey, prompt, maxTokens = MAX_TOKENS) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: maxTokens,
        temperature: 0.7,
        return_full_text: false
      }
    });

    const req = https.request({
      hostname: 'api-inference.huggingface.co',
      path: '/models/mistralai/Mistral-7B-Instruct-v0.2',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) return reject(new Error(`Hugging Face: ${parsed.error}`));
          if (parsed[0]?.generated_text) return resolve(parsed[0].generated_text);
          reject(new Error('Unexpected Hugging Face response format'));
        } catch (e) {
          reject(new Error('Could not parse Hugging Face response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('Hugging Face API timed out')); });
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. Claude API
// ─────────────────────────────────────────────────────────────────────────────
function callClaude(messages, systemPrompt, maxTokens = MAX_TOKENS) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey || apiKey.includes('REPLACE')) {
      return reject(new Error('ANTHROPIC_API_KEY not configured'));
    }

    const formattedMsgs = typeof messages === 'string' 
      ? [{ role: 'user', content: messages }] 
      : messages;

    const body = JSON.stringify({ 
      model: process.env.AI_MODEL || 'claude-3-5-sonnet-20241022', 
      max_tokens: maxTokens, 
      system: systemPrompt, 
      messages: formattedMsgs 
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) return reject(new Error(`Claude API: ${parsed.error.message}`));
          if (parsed.content && parsed.content[0]) return resolve(parsed.content[0].text);
          reject(new Error('Unexpected Claude response format'));
        } catch (e) {
          reject(new Error('Could not parse Claude response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('Claude API timed out')); });
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  7. Detect intent/topic
// ─────────────────────────────────────────────────────────────────────────────
function detectIntent(message) {
  const m = message.toLowerCase();
  if (m.match(/profit|revenue|earn|margin|sales|income|grow|turnover/)) return 'profit';
  if (m.match(/cost|expense|spend|cut|reduce|waste|save|saving|subscription|bill/)) return 'cost_reduction';
  if (m.match(/cash.?flow|liquidity|runway|receivable|payable|invoice|owe|debt/)) return 'cash_flow';
  if (m.match(/risk|danger|loss|fraud|overdue|bad.?debt|exposure|protect/)) return 'risk';
  if (m.match(/budget|allocat|plan|forecast|predict|next month|next quarter/)) return 'budgeting';
  if (m.match(/invest|stock|mutual fund|fd|fixed deposit|sip|return/)) return 'investment';
  if (m.match(/tax|gst|tds|itr|deduction|exempt/)) return 'tax';
  if (m.match(/salary|hire|employee|staff|payroll|team|hr/)) return 'hr_finance';
  if (m.match(/loan|emi|borrow|credit|interest rate|mortgage/)) return 'debt';
  if (m.match(/grocery|food|utility|electric|water|rent.*home|household/)) return 'household';
  if (m.match(/grant|ngo|donor|fund|impact|program/)) return 'ngo';
  if (m.match(/hello|hi|hey|good morning|who are you|what can you/)) return 'greeting';
  return 'general';
}

// ─────────────────────────────────────────────────────────────────────────────
//  8. Build financial context from MongoDB
// ─────────────────────────────────────────────────────────────────────────────
async function buildFinancialContext(Transaction, userId) {
  try {
    const now = new Date();
    const bom = new Date(now.getFullYear(), now.getMonth(), 1);
    const lmS = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lmE = new Date(now.getFullYear(), now.getMonth(), 0);
    const m3S = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const m6S = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const [thisMonth, lastMonth, topExpenses, topIncome, monthlyTrend, recentTx, totalCount] = await Promise.all([
      Transaction.aggregate([
        { $match: { user: userId, date: { $gte: bom } } },
        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Transaction.aggregate([
        { $match: { user: userId, date: { $gte: lmS, $lte: lmE } } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { user: userId, type: 'expense', date: { $gte: m3S } } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 }, avg: { $avg: '$amount' } } },
        { $sort: { total: -1 } }, { $limit: 8 }
      ]),
      Transaction.aggregate([
        { $match: { user: userId, type: 'income', date: { $gte: m3S } } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }, { $limit: 5 }
      ]),
      Transaction.aggregate([
        { $match: { user: userId, date: { $gte: m6S } } },
        { $group: { _id: { yr: { $year: '$date' }, mo: { $month: '$date' }, type: '$type' }, total: { $sum: '$amount' } } },
        { $sort: { '_id.yr': 1, '_id.mo': 1 } }
      ]),
      Transaction.find({ user: userId }).sort({ date: -1 }).limit(8).lean(),
      Transaction.countDocuments({ user: userId })
    ]);

    const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN');
    const get = (arr, t) => arr.find(a => a._id === t)?.total || 0;
    const pct = (a, b) => b ? ((a - b) / b * 100).toFixed(1) : null;

    const tmIn = get(thisMonth, 'income');
    const tmEx = get(thisMonth, 'expense');
    const lmIn = get(lastMonth, 'income');
    const lmEx = get(lastMonth, 'expense');
    const tmNet = tmIn - tmEx;
    const lmNet = lmIn - lmEx;
    const savingsRate = tmIn > 0 ? ((tmNet / tmIn) * 100).toFixed(1) : 0;

    const trendLines = monthlyTrend.map(m =>
      `${m._id.yr}-${String(m._id.mo).padStart(2, '0')} | ${m._id.type}: ${fmt(m.total)}`
    ).join('\n');

    let ctx = `=== LIVE FINANCIAL DATA FROM MONGODB ===\nTotal transactions: ${totalCount}\n\n`;

    if (tmIn || tmEx) {
      ctx += `THIS MONTH:\n  Income: ${fmt(tmIn)}\n  Expenses: ${fmt(tmEx)}\n  Net: ${fmt(tmNet)} (savings rate: ${savingsRate}%)\n`;
      if (lmIn || lmEx) {
        const incChg = pct(tmIn, lmIn);
        const expChg = pct(tmEx, lmEx);
        ctx += `  Income vs last month: ${incChg !== null ? (incChg >= 0 ? '↑' : '↓') + Math.abs(incChg) + '%' : 'n/a'}\n`;
        ctx += `  Expenses vs last month: ${expChg !== null ? (expChg >= 0 ? '↑' : '↓') + Math.abs(expChg) + '%' : 'n/a'}\n`;
      }
    }

    if (lmIn || lmEx) {
      ctx += `\nLAST MONTH:\n  Income: ${fmt(lmIn)}, Expenses: ${fmt(lmEx)}, Net: ${fmt(lmNet)}\n`;
    }

    if (topExpenses.length) {
      ctx += `\nTOP EXPENSE CATEGORIES (last 3 months):\n`;
      topExpenses.forEach((e, i) =>
        ctx += `  ${i + 1}. ${e._id}: ${fmt(e.total)} across ${e.count} transactions (avg ${fmt(Math.round(e.avg))} each)\n`
      );
    }

    if (topIncome.length) {
      ctx += `\nINCOME SOURCES (last 3 months):\n`;
      topIncome.forEach((e, i) =>
        ctx += `  ${i + 1}. ${e._id}: ${fmt(e.total)} (${e.count} transactions)\n`
      );
    }

    if (trendLines) {
      ctx += `\n6-MONTH MONTHLY TREND:\n${trendLines}\n`;
    }

    if (recentTx.length) {
      ctx += `\nMOST RECENT TRANSACTIONS:\n`;
      recentTx.forEach(t =>
        ctx += `  ${new Date(t.date).toLocaleDateString('en-IN')} | ${t.type === 'income' ? '+' : '-'}${fmt(t.amount)} | ${t.category} | ${t.description || '-'}\n`
      );
    }

    if (totalCount === 0) ctx = 'No transaction data yet — user is brand new.';

    return ctx;
  } catch (err) {
    console.error('buildFinancialContext error:', err.message);
    return 'Unable to load financial data right now.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  9. Build system prompt
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(user, financialContext, intent) {
  const intentGuides = {
    profit: 'The user is asking about PROFIT/REVENUE. Focus on: identifying high-margin products or clients, pricing strategies, upselling opportunities, revenue leakage, and growth tactics.',
    cost_reduction: 'The user wants to REDUCE COSTS. Focus on: identifying top expense categories, flagging wasteful spending, vendor renegotiation, and quick wins.',
    cash_flow: 'The user is asking about CASH FLOW. Focus on: current month net position, payment terms, upcoming obligations, and runway.',
    risk: 'The user is asking about FINANCIAL RISK. Focus on: customer concentration, overdue receivables, high fixed costs, and debt ratios.',
    budgeting: 'The user is asking about BUDGETING/FORECASTING. Focus on: spending patterns vs income, realistic monthly targets, and simple budget frameworks.',
    investment: 'The user is asking about INVESTMENTS. Focus on: safe investment options for their profile, risk-return tradeoffs, and portfolio building.',
    tax: 'The user is asking about TAX. Focus on: common deductions, GST implications, and advance tax planning.',
    hr_finance: 'The user is asking about STAFF/PAYROLL COSTS. Focus on: cost-per-hire, productivity ROI, and benefits optimisation.',
    debt: 'The user is asking about LOANS/EMIs. Focus on: total debt load, interest costs, prepayment strategies, and refinancing.',
    household: 'The user is asking about HOUSEHOLD finances. Focus on: everyday savings, grocery/utility bills, and emergency funds.',
    ngo: 'The user is asking about NGO/ORGANISATION finances. Focus on: budget utilisation, grant opportunities, and admin cost ratios.',
    greeting: 'The user is greeting you. Introduce yourself warmly and explain what you can help with.',
    general: 'Answer thoughtfully based on the user\'s question and their financial snapshot.'
  };

  const typeContext = {
    business: 'Running a BUSINESS.',
    organisation: 'Managing an ORGANISATION/NGO.',
    household: 'Managing a HOUSEHOLD.'
  };

  return `You are FinWise AI, a sharp and friendly expert financial advisor built into a financial intelligence platform for India.

USER PROFILE:
- Name: ${user?.name || 'User'}
- Account type: ${typeContext[user?.userType] || user?.userType || 'Personal'}
- Subscription: ${user?.plan || 'starter'} plan

${financialContext}

CURRENT QUESTION TOPIC: ${intent.toUpperCase()}
GUIDANCE FOR THIS TOPIC: ${intentGuides[intent] || intentGuides.general}

HOW TO RESPOND:
1. Reference SPECIFIC numbers from the financial context if available.
2. Structure longer answers clearly using bullet points or numbered lists.
3. Use Indian currency format: ₹1,20,000.
4. End EVERY response with a bold **Next step:** line — one specific, actionable action.`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. Insights & Cash Flow Generator
// ─────────────────────────────────────────────────────────────────────────────
async function generateInsights(user, Transaction) {
  const now = new Date();
  const m3S = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const m1S = new Date(now.getFullYear(), now.getMonth(), 1);

  const [income3m, expense3m, thisMonthData, flagged, recurring] = await Promise.all([
    Transaction.aggregate([
      { $match: { user: user._id, type: 'income', date: { $gte: m3S } } },
      { $group: { _id: null, total: { $sum: '$amount' }, avg: { $avg: '$amount' }, count: { $sum: 1 } } }
    ]),
    Transaction.aggregate([
      { $match: { user: user._id, type: 'expense', date: { $gte: m3S } } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 }, avg: { $avg: '$amount' } } },
      { $sort: { total: -1 } }
    ]),
    Transaction.aggregate([
      { $match: { user: user._id, date: { $gte: m1S } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } }
    ]),
    Transaction.find({ user: user._id, 'aiFlag.isFlagged': true }).lean(),
    Transaction.find({ user: user._id, 'recurring.isRecurring': true }).lean()
  ]);

  return {
    summary: {
      income3mTotal: income3m[0]?.total || 0,
      topExpenses: expense3m.slice(0, 5),
      flaggedCount: flagged.length,
      recurringCount: recurring.length
    }
  };
}

async function forecastCashFlow(user, Transaction) {
  let finContext = "No transaction model provided.";
  if (Transaction && user?._id) {
    finContext = await buildFinancialContext(Transaction, user._id);
  }
  
  const prompt = "Analyze recent transactions and forecast cash flow for the next 30 days.";
  const systemPrompt = `You are a financial advisor. Provide a short, structured cash flow forecast with expected income, expenses, and net balance.\n\n${finContext}`;
  return await callAI(prompt, systemPrompt);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SINGLE EXPORT BLOCK AT THE VERY BOTTOM
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  callAI,
  detectIntent,
  buildFinancialContext,
  buildSystemPrompt,
  generateInsights,
  forecastCashFlow
};