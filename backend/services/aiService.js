/**
 * FinWise AI Service — Multi-Provider with Fallback
 * Supports: OpenAI GPT-4, Google Gemini, Anthropic Claude
 * Priority: OpenAI → Gemini → Claude
 */

const https = require('https');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS) || 1500;
const CTX_MSGS = parseInt(process.env.AI_CONTEXT_MESSAGES) || 14;

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
//  Multi-Provider AI Call with Fallback
// ─────────────────────────────────────────────────────────────────────────────
async function callAI(messages, systemPrompt, maxTokens = MAX_TOKENS) {
  const errors = [];

  // Try Ollama first (LOCAL AI - FREE & UNLIMITED)
  const useOllama = process.env.USE_OLLAMA !== 'false'; // Enabled by default
  if (useOllama) {
    try {
      console.log('[AI] Trying Ollama (Local AI)...');
      const userMessage = messages[messages.length - 1].content;
      const result = await callOllama(userMessage, systemPrompt, maxTokens);
      console.log('[AI] ✓ Ollama succeeded');
      return result;
    } catch (e) {
      errors.push(`Ollama: ${e.message}`);
      console.log('[AI] ✗ Ollama failed:', e.message);
    }
  }

  // Try Mock AI second (ALWAYS WORKS - for development/testing)
  const useMockAI = process.env.USE_MOCK_AI !== 'false'; // Enabled as fallback
  if (useMockAI) {
    try {
      console.log('[AI] Using Mock AI (Development Mode)...');
      const userMessage = messages[messages.length - 1].content;
      const result = getMockAIResponse(userMessage, systemPrompt);
      console.log('[AI] ✓ Mock AI succeeded');
      return result;
    } catch (e) {
      errors.push(`MockAI: ${e.message}`);
      console.log('[AI] ✗ Mock AI failed:', e.message);
    }
  }

  // Try Hugging Face second (FREE!)
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (hfKey && !hfKey.includes('REPLACE')) {
    try {
      console.log('[AI] Trying Hugging Face (FREE)...');
      const userMessage = messages[messages.length - 1].content;
      const prompt = `You are FinWise AI, a helpful financial advisor for India. Give practical advice in 2-3 paragraphs.\n\nUser: ${userMessage}\n\nAssistant:`;
      
      const result = await callHuggingFace(hfKey, prompt, maxTokens);
      console.log('[AI] ✓ Hugging Face succeeded');
      return result;
    } catch (e) {
      errors.push(`HuggingFace: ${e.message}`);
      console.log('[AI] ✗ Hugging Face failed:', e.message);
    }
  }

  // Try OpenAI second
  if (openai) {
    try {
      console.log('[AI] Trying OpenAI GPT-4...');
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
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

  // Try Gemini second
  if (gemini) {
    try {
      console.log('[AI] Trying Google Gemini...');
      const model = gemini.getGenerativeModel({
        model: 'gemini-1.5-flash'
      });
      
      // Build full conversation context
      const userMessage = messages[messages.length - 1].content;
      const fullPrompt = `You are FinWise AI, a helpful financial advisor for India.\n\nUser: ${userMessage}\n\nAssistant:`;
      
      // Use generateContent instead of chat for simpler API
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.7,
        }
      });
      
      console.log('[AI] ✓ Gemini succeeded');
      return result.response.text();
    } catch (e) {
      errors.push(`Gemini: ${e.message}`);
      console.log('[AI] ✗ Gemini failed:', e.message);
    }
  }

  // Try Claude last
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (apiKey && !apiKey.includes('REPLACE')) {
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

  // All providers failed
  throw new Error(`All AI providers failed:\n${errors.join('\n')}\n\nPlease add at least one API key to backend/.env:\n- OPENAI_API_KEY (get from platform.openai.com)\n- GEMINI_API_KEY (get from makersuite.google.com)\n- ANTHROPIC_API_KEY (get from console.anthropic.com)`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Ollama API (Local AI - FREE & UNLIMITED)
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
//  Mock AI (Development/Testing - Always Works)
// ─────────────────────────────────────────────────────────────────────────────
function getMockAIResponse(userMessage, systemPrompt) {
  const msg = userMessage.toLowerCase();
  
  // More specific pattern matching with priority
  
  // Greetings
  if (msg.match(/^(hello|hi|hey|good morning|good evening|namaste)[\s!?]*$/i)) {
    return "Hello! I'm FinWise AI, your personal financial advisor for India. I can help you with budgeting, expense tracking, savings strategies, and financial planning. What would you like to discuss today?\n\n**Next step:** Tell me about your current financial situation or ask me a specific question about managing your money.";
  }
  
  // Specific questions about reducing expenses
  if (msg.match(/reduce.*expense|cut.*cost|lower.*spending|decrease.*expense/)) {
    return "Here are practical ways to reduce your expenses:\n\n**Immediate Actions:**\n1. Cancel unused subscriptions (Netflix, Spotify, gym you don't use)\n2. Cook at home instead of ordering food (saves ₹3,000-5,000/month)\n3. Use public transport or carpool (saves ₹2,000-4,000/month)\n4. Switch to LED bulbs and unplug devices (saves ₹500-1,000/month on electricity)\n\n**Medium-term:**\n- Negotiate better rates with service providers (internet, insurance)\n- Buy generic brands instead of premium ones\n- Plan grocery shopping with a list to avoid impulse buys\n\n**Next step:** Identify your top 3 expense categories and find one way to reduce each by 10-20%.";
  }
  
  // Cash flow questions
  if (msg.match(/cash.*flow|money.*flow|income.*expense|monthly.*balance/)) {
    return "Let's improve your cash flow:\n\n**Understanding Cash Flow:**\nCash flow = Money In - Money Out. Positive cash flow means you're saving, negative means you're overspending.\n\n**Improvement Strategies:**\n1. **Increase Income**: Freelance work, side hustle, ask for a raise\n2. **Reduce Fixed Costs**: Renegotiate rent, switch to cheaper phone plan\n3. **Time Your Payments**: Pay bills after salary day to avoid overdrafts\n4. **Build a Buffer**: Keep ₹10,000-20,000 in checking account\n\n**Track It:** Use the 'Transactions' tab to see your actual cash flow patterns.\n\n**Next step:** Calculate your average monthly cash flow for the last 3 months to identify trends.";
  }
  
  // Profit/revenue questions
  if (msg.match(/profit|revenue|earn.*more|increase.*income|make.*money/)) {
    return "Ways to increase your income:\n\n**For Salaried Employees:**\n1. Ask for a raise (prepare data showing your value)\n2. Switch jobs (typically 20-30% salary jump)\n3. Upskill (learn high-demand skills like data analysis, coding)\n4. Start freelancing on weekends (₹10,000-30,000/month extra)\n\n**For Business Owners:**\n1. Increase prices by 5-10% (most customers won't leave)\n2. Upsell existing customers (easier than finding new ones)\n3. Reduce customer acquisition cost\n4. Improve conversion rates\n\n**Passive Income:**\n- Rent out spare room (₹5,000-15,000/month)\n- Invest in dividend-paying stocks\n- Create digital products\n\n**Next step:** Pick ONE income-increasing strategy and take action this week.";
  }
  
  // Savings questions
  if (msg.match(/save|saving|savings/) && !msg.match(/account/)) {
    return "Smart savings strategies for India:\n\n**The 50-30-20 Rule:**\n- 50% for needs (rent, food, utilities)\n- 30% for wants (entertainment, dining out)\n- 20% for savings and investments\n\n**Automation is Key:**\nSet up automatic transfers on salary day:\n- ₹5,000 to savings account\n- ₹3,000 to recurring deposit\n- ₹2,000 to mutual fund SIP\n\n**Quick Wins:**\n- Cancel unused subscriptions (₹500-2,000/month)\n- Pack lunch instead of eating out (₹3,000/month)\n- Use cashback apps for shopping (₹500-1,000/month)\n\n**Next step:** Set up ONE automatic savings transfer today, even if it's just ₹1,000/month.";
  }
  
  // Budget questions
  if (msg.match(/budget|expense.*track|spending.*plan/)) {
    return "Creating a realistic budget:\n\n**Step 1: Track Everything (1 month)**\nRecord every expense, no matter how small. Use this app's 'Transactions' feature!\n\n**Step 2: Categorize**\n- Housing: 25-30%\n- Food: 15-20%\n- Transport: 10-15%\n- Utilities: 5-10%\n- Savings: 20%+\n- Fun: 5-10%\n\n**Step 3: Set Limits**\nBased on your tracking, set realistic limits for each category.\n\n**Step 4: Review Weekly**\nCheck if you're on track. Adjust as needed.\n\n**Pro Tip:** Use the envelope method - allocate cash for each category.\n\n**Next step:** Add all your expenses from last month to see where your money actually goes.";
  }
  
  // Investment questions
  if (msg.match(/invest|investment|mutual.*fund|stock|sip|share.*market/)) {
    return "Investment guide for beginners:\n\n**Start Here:**\n1. Emergency fund first (6 months expenses)\n2. Clear high-interest debt (credit cards)\n3. Then start investing\n\n**Best Options for Beginners:**\n- **Index Funds**: Nifty 50 or Sensex (low cost, diversified)\n- **ELSS**: Tax saving + equity returns\n- **PPF**: Safe, guaranteed 7-8% returns\n- **Gold**: 5-10% of portfolio for stability\n\n**How Much to Invest:**\n- Start with ₹1,000-2,000/month SIP\n- Increase by 10% every year\n- Don't invest money you'll need in 3 years\n\n**Avoid:** Individual stocks (too risky for beginners), insurance as investment (LIC policies), crypto (highly volatile)\n\n**Next step:** Open a mutual fund account on Groww/Zerodha and start a ₹1,000 SIP in a Nifty 50 index fund.";
  }
  
  // Debt/loan questions
  if (msg.match(/debt|loan|emi|credit.*card|borrow/)) {
    return "Debt management strategy:\n\n**Priority Order (highest interest first):**\n1. Credit cards (18-36%) - PAY THIS FIRST!\n2. Personal loans (10-20%)\n3. Car loans (8-12%)\n4. Home loans (7-9%) - lowest priority\n\n**Debt Snowball Method:**\n1. Pay minimum on all debts\n2. Put extra money on highest interest debt\n3. Once paid off, move to next highest\n4. Repeat until debt-free\n\n**Quick Tips:**\n- Never pay just the minimum on credit cards\n- Consider balance transfer for lower rates\n- Avoid taking new loans while clearing old ones\n- Build emergency fund to avoid future debt\n\n**Next step:** List all your debts with interest rates and create a payoff plan starting with the highest rate.";
  }
  
  // Tax questions
  if (msg.match(/tax|gst|itr|deduction|80c|80d/)) {
    return "Tax-saving strategies for India:\n\n**Section 80C (₹1.5 lakh limit):**\n- ELSS mutual funds (best returns)\n- PPF (safe, guaranteed)\n- Life insurance premiums\n- Home loan principal\n- Children's tuition fees\n\n**Section 80D (Health Insurance):**\n- ₹25,000 for self/family\n- ₹50,000 if parents are senior citizens\n\n**Other Deductions:**\n- 80E: Education loan interest (unlimited)\n- 80G: Donations to charity\n- HRA: House rent allowance\n\n**Pro Tip:** Invest in ELSS early in the year, not in March rush!\n\n**Next step:** Calculate your current tax liability and identify which deductions you're missing.";
  }
  
  // Emergency fund questions
  if (msg.match(/emergency.*fund|crisis.*fund|rainy.*day/)) {
    return "Building your emergency fund:\n\n**Target Amount:**\n- Salaried: 6 months of expenses\n- Self-employed: 12 months of expenses\n- Example: If monthly expenses are ₹30,000, save ₹1,80,000\n\n**Where to Keep It:**\n1. High-interest savings account (instant access)\n2. Liquid mutual funds (1-day withdrawal)\n3. Short-term FDs (with premature withdrawal)\n\n**How to Build:**\n- Month 1: Save ₹10,000 (start immediately)\n- Months 2-18: Add ₹10,000/month\n- Use bonuses/tax refunds to boost it\n\n**When to Use:** Job loss, medical emergency, urgent home repairs. NOT for vacations or shopping!\n\n**Next step:** Open a separate savings account called 'Emergency Fund' and transfer ₹10,000 today.";
  }
  
  // Risk questions
  if (msg.match(/risk|danger|protect|insurance|safe/)) {
    return "Managing financial risks:\n\n**Essential Insurance:**\n1. **Health Insurance**: ₹5-10 lakh cover minimum\n2. **Term Life Insurance**: 10-15x annual income (if you have dependents)\n3. **Accident Insurance**: ₹50 lakh-1 crore cover\n\n**Risk Mitigation:**\n- Diversify investments (don't put all eggs in one basket)\n- Maintain emergency fund (6 months expenses)\n- Avoid high-risk investments you don't understand\n- Keep important documents safe (digital + physical copies)\n\n**Red Flags to Avoid:**\n- Guaranteed high returns (usually scams)\n- Pressure to invest immediately\n- Unregistered investment schemes\n- Borrowing to invest\n\n**Next step:** Review your insurance coverage - do you have adequate health and term life insurance?";
  }
  
  // Default response for unmatched questions
  return `I understand you're asking about "${userMessage}". Let me provide some general financial guidance:\n\n**Key Financial Principles:**\n1. **Track your money**: Know where every rupee goes\n2. **Save first, spend later**: Automate savings on salary day\n3. **Invest for long-term**: Start small, stay consistent\n4. **Avoid bad debt**: Credit cards and personal loans are expensive\n5. **Build safety nets**: Emergency fund and insurance\n\n**I can help you with:**\n- Budgeting and expense tracking\n- Savings strategies\n- Investment advice\n- Debt management\n- Tax planning\n- Emergency fund building\n\n**Next step:** Ask me a more specific question like "How can I save ₹10,000 per month?" or "Should I invest in mutual funds or FDs?"`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Hugging Face API (FREE)
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
//  Claude API (fallback)
// ─────────────────────────────────────────────────────────────────────────────
function callClaude(messages, systemPrompt, maxTokens = MAX_TOKENS) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey || apiKey.includes('REPLACE')) {
      return reject(new Error('ANTHROPIC_API_KEY not configured'));
    }

    const body = JSON.stringify({ 
      model: process.env.AI_MODEL || 'claude-sonnet-4-6', 
      max_tokens: maxTokens, 
      system: systemPrompt, 
      messages 
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
//  Detect intent/topic
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
//  Build financial context from MongoDB
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
//  Build system prompt
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(user, financialContext, intent) {
  const intentGuides = {
    profit: 'The user is asking about PROFIT/REVENUE. Focus on: identifying high-margin products or clients, pricing strategies, upselling opportunities, revenue leakage, and growth tactics. Be specific with numbers from their data.',
    cost_reduction: 'The user wants to REDUCE COSTS. Focus on: identifying their top expense categories, flagging wasteful spending, vendor renegotiation tactics, subscription audits, and quick wins they can action this week.',
    cash_flow: 'The user is asking about CASH FLOW. Focus on: current month net position, payment terms, receivables, upcoming obligations, runway, and practical steps to improve liquidity quickly.',
    risk: 'The user is asking about FINANCIAL RISK. Focus on: customer concentration, overdue receivables, high fixed costs, debt ratios, single points of failure, and how to mitigate each risk with specific actions.',
    budgeting: 'The user is asking about BUDGETING/FORECASTING. Focus on: their spending patterns vs income, realistic monthly targets for each category, and a simple budget framework they can follow.',
    investment: 'The user is asking about INVESTMENTS. Focus on: safe and appropriate investment options for their profile, risk-return tradeoffs, and building a diversified portfolio. Always recommend consulting a SEBI-registered advisor for large decisions.',
    tax: 'The user is asking about TAX. Focus on: common deductions they may be missing, GST implications, advance tax planning, and keeping good records. Always note they should consult a CA for compliance.',
    hr_finance: 'The user is asking about STAFF/PAYROLL COSTS. Focus on: cost-per-hire, productivity ROI, benefits optimisation, and when it makes financial sense to hire vs outsource.',
    debt: 'The user is asking about LOANS/EMIs. Focus on: total debt load, interest costs, prepayment strategies, refinancing opportunities, and maintaining a healthy credit profile.',
    household: 'The user is asking about HOUSEHOLD finances. Focus on: everyday savings, grocery and utility bills, subscriptions, emergency fund, and simple money habits that compound over time.',
    ngo: 'The user is asking about NGO/ORGANISATION finances. Focus on: budget utilisation, grant opportunities, admin cost ratios, donor reporting, and maximising impact per rupee spent.',
    greeting: 'The user is greeting you. Introduce yourself warmly, briefly explain what you can help with (profit, costs, cash flow, risk, savings), and ask what they want to work on first. Reference that you can see their financial data.',
    general: 'Answer thoughtfully based on the user\'s question and their financial snapshot. Be genuinely helpful and specific.'
  };

  const typeContext = {
    business: 'Running a BUSINESS. Prioritise: profit margins, cash flow, vendor costs, revenue growth, and managing business risk.',
    organisation: 'Managing an ORGANISATION/NGO. Prioritise: budget efficiency, grant utilisation, admin cost control, and impact per rupee.',
    household: 'Managing a HOUSEHOLD. Prioritise: monthly savings, reducing waste, building emergency fund, and smart everyday spending.'
  };

  return `You are FinWise AI, a sharp and friendly expert financial advisor built into a financial intelligence platform for India.

USER PROFILE:
- Name: ${user.name}
- Account type: ${typeContext[user.userType] || user.userType}
- Subscription: ${user.plan || 'starter'} plan

${financialContext}

CURRENT QUESTION TOPIC: ${intent.toUpperCase()}
GUIDANCE FOR THIS TOPIC: ${intentGuides[intent] || intentGuides.general}

HOW TO RESPOND:
1. Read the financial data above carefully. If the user has data, reference SPECIFIC numbers (exact amounts, categories, percentages) in your answer — never give generic advice when you have real data to work with.
2. Give a DIFFERENT, focused answer for each different question. Do not repeat the same advice across different topics.
3. Structure longer answers clearly: use short paragraphs or a brief numbered list when explaining multiple points.
4. Use Indian currency format: ₹1,20,000 (not 120000 or $1200).
5. Keep it conversational and clear — no jargon, no unnecessary hedging. Speak like a knowledgeable friend.
6. End EVERY response with a bold **Next step:** line — one specific, immediately actionable thing they can do today.
7. If the user has NO transaction data yet, acknowledge that and guide them to add their first transaction so you can give personalised advice.
8. If asked something completely unrelated to finance (cricket, recipes, etc.), politely say you specialise in financial advice and redirect.
9. Keep responses focused: 100–300 words for simple questions, up to 500 for detailed breakdowns. Never pad.`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main chat function
// ─────────────────────────────────────────────────────────────────────────────
async function chat(messageHistory, userMessage, user, Transaction) {
  const intent = detectIntent(userMessage);
  const context = await buildFinancialContext(Transaction, user._id);
  const sysPrompt = buildSystemPrompt(user, context, intent);

  const history = messageHistory
    .slice(-CTX_MSGS)
    .map(m => ({ role: m.role, content: m.content }));

  history.push({ role: 'user', content: userMessage });

  const reply = await callAI(history, sysPrompt, MAX_TOKENS);
  return { reply, intent, context };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Generate insights
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

  const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN');
  const totalIncome = income3m[0]?.total || 0;
  const totalExpenses = expense3m.reduce((s, e) => s + e.total, 0);
  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) : 0;
  const tmIn = thisMonthData.find(d => d._id === 'income')?.total || 0;
  const tmEx = thisMonthData.find(d => d._id === 'expense')?.total || 0;
  const topCat = expense3m[0];

  const dataBlock = `
USER TYPE: ${user.userType}
3-MONTH PERIOD:
  Total income: ${fmt(totalIncome)} (avg ${fmt(Math.round((income3m[0]?.avg || 0)))} per transaction)
  Total expenses: ${fmt(totalExpenses)}
  Net savings: ${fmt(netSavings)}
  Savings rate: ${savingsRate}%
THIS MONTH SO FAR:
  Income: ${fmt(tmIn)}, Expenses: ${fmt(tmEx)}, Net: ${fmt(tmIn - tmEx)}
TOP EXPENSE CATEGORIES (3 months):
${expense3m.slice(0, 7).map((e, i) => `  ${i + 1}. ${e._id}: ${fmt(e.total)} across ${e.count} transactions (avg ${fmt(Math.round(e.avg))})`).join('\n')}
FLAGGED ITEMS: ${flagged.length} transactions flagged for review
RECURRING COSTS: ${recurring.length} recurring items on record
HIGHEST SINGLE EXPENSE CATEGORY: ${topCat ? `${topCat._id} at ${fmt(topCat.total)} (3 months)` : 'none'}
  `.trim();

  const sys = `You are a senior financial analyst. Study this data and return EXACTLY a JSON array of 5 insight objects. Return ONLY the raw JSON array — no markdown, no explanation, no preamble.

Each insight must:
- Be SPECIFIC to the actual numbers in the data (reference exact figures)
- Be ACTIONABLE (tell the user exactly what to do)
- Have a realistic estimatedImpact in INR

Required JSON shape:
[
  {
    "type": "saving" | "risk" | "opportunity" | "warning" | "achievement",
    "priority": "high" | "medium" | "low",
    "title": "Concise title under 75 chars with specific number if possible",
    "description": "Specific, actionable advice under 180 chars referencing actual data",
    "estimatedImpact": 0,
    "impactType": "saving" | "revenue" | "risk_reduction"
  }
]`;

  const raw = await callAI(
    [{ role: 'user', content: `Analyse and generate 5 insights:\n\n${dataBlock}` }],
    sys, 2000
  );

  try {
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const m = raw.match(/\[[\s\S]*?\]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Cash flow forecast
// ─────────────────────────────────────────────────────────────────────────────
async function forecastCashFlow(user, Transaction) {
  const now = new Date();
  const m6S = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  const monthly = await Transaction.aggregate([
    { $match: { user: user._id, date: { $gte: m6S } } },
    { $group: { _id: { yr: { $year: '$date' }, mo: { $month: '$date' }, type: '$type' }, total: { $sum: '$amount' } } },
    { $sort: { '_id.yr': 1, '_id.mo': 1 } }
  ]);

  const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN');
  const history = monthly.map(m => `${m._id.yr}-${String(m._id.mo).padStart(2, '0')} ${m._id.type}: ${fmt(m.total)}`).join('\n') || 'No data.';

  const sys = `You are a financial forecasting expert for India. Analyse the monthly transaction history and return ONLY a JSON object — no markdown.

Required shape:
{
  "next30days": { "expectedIncome": number, "expectedExpenses": number, "netCashFlow": number, "confidence": "high"|"medium"|"low" },
  "next90days": { "expectedIncome": number, "expectedExpenses": number, "netCashFlow": number, "confidence": "high"|"medium"|"low" },
  "risks": ["risk1", "risk2"],
  "recommendations": ["action1", "action2", "action3"],
  "summary": "2-sentence plain English summary referencing the actual numbers"
}`;

  const raw = await callAI(
    [{ role: 'user', content: `Monthly data (6 months):\n${history}\n\nUser type: ${user.userType}\nGenerate cash flow forecast.` }],
    sys, 1000
  );

  try {
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Quick advice
// ─────────────────────────────────────────────────────────────────────────────
async function quickAdvice(question, user, Transaction) {
  return chat([], question, user, Transaction);
}

module.exports = { chat, generateInsights, forecastCashFlow, quickAdvice, callAI, buildFinancialContext };

// Made with Bob
