/**
 * FinWise AI Service — Multi-Provider with Fallback
 */

const https = require('https');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS, 10) || 1500;

let openai = null;
let gemini = null;

if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('REPLACE')) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('REPLACE')) {
  gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

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

async function callAI(messages, systemPrompt, maxTokens = MAX_TOKENS, requiresJSON = false) {
  const errors = [];
  const userMessage = typeof messages === 'string' ? messages : (messages[messages.length - 1]?.content || '');

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const result = await callOpenRouter(userMessage, systemPrompt, maxTokens);
      return result;
    } catch (e) {
      errors.push(`OpenRouter: ${e.message}`);
    }
  }

  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const fullPrompt = systemPrompt + "\n\nUser: " + userMessage + "\n\nAssistant:";
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
      });
      return result.response.text();
    } catch (e) {
      errors.push(`Gemini: ${e.message}`);
    }
  }

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        max_tokens: maxTokens
      });
      return response.choices[0].message.content;
    } catch (e) {
      errors.push(`OpenAI: ${e.message}`);
    }
  }

  if (!requiresJSON) {
    return "Unable to generate custom response at this moment.";
  }

  throw new Error("All AI providers failed:\n" + errors.join('\n'));
}

function detectIntent(message) {
  const m = message.toLowerCase();
  if (m.match(/profit|revenue|earn/)) return 'profit';
  if (m.match(/cost|expense|spend|cut/)) return 'cost_reduction';
  if (m.match(/cash.?flow|liquidity/)) return 'cash_flow';
  return 'general';
}

async function buildFinancialContext(Transaction, userId) {
  try {
    const totalCount = await Transaction.countDocuments({ user: userId });
    const recentTx = await Transaction.find({ user: userId }).sort({ date: -1 }).limit(10).lean();
    
    let ctx = "Total transactions: " + totalCount + "\n";
    recentTx.forEach(t => {
      ctx += (t.date ? t.date.toISOString().split('T')[0] : '') + " | " + t.type + " | ₹" + t.amount + " | " + t.category + "\n";
    });
    return ctx;
  } catch (e) {
    return "No transactions found.";
  }
}

function buildSystemPrompt(user, financialContext, intent) {
  return "You are FinWise AI advisor for " + (user?.name || 'User') + ".\nContext:\n" + financialContext;
}

async function generateInsights(user, Transaction) {
  return { summary: "Insights generated successfully." };
}

async function forecastCashFlow(user, Transaction) {
  let finContext = "No transaction model provided.";
  let recentTxCount = 0;

  if (Transaction && user?._id) {
    finContext = await buildFinancialContext(Transaction, user._id);
    recentTxCount = await Transaction.countDocuments({ user: user._id });
  }

  const systemPrompt = "You are a financial advisor. Return ONLY a valid JSON object matching this structure (no markdown, no backticks, no extra text):\n{\n  \"n30\": {\n    \"expectedIncome\": 0,\n    \"expectedExpenses\": 0,\n    \"netCashFlow\": 0,\n    \"confidence\": \"medium\"\n  },\n  \"n90\": {\n    \"expectedIncome\": 0,\n    \"expectedExpenses\": 0,\n    \"netCashFlow\": 0,\n    \"confidence\": \"medium\"\n  },\n  \"summary\": \"Short cash flow summary paragraph based on financial trends.\"\n}\n\nFinancial Context:\n" + finContext;

  const userPrompt = "Generate 30-day (n30) and 90-day (n90) cash flow forecasts based on the user's financial history.";

  try {
    const rawResponse = await callAI(userPrompt, systemPrompt, MAX_TOKENS, true);
    const cleanJson = rawResponse.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      n30: parsed.n30 || { expectedIncome: 0, expectedExpenses: 0, netCashFlow: 0, confidence: "low" },
      n90: parsed.n90 || { expectedIncome: 0, expectedExpenses: 0, netCashFlow: 0, confidence: "low" },
      summary: parsed.summary || "Forecast generated based on recent financial activity."
    };
  } catch (err) {
    console.error('forecastCashFlow error:', err.message);
    const confidenceLevel = recentTxCount > 5 ? "medium" : "low";
    return {
      n30: { expectedIncome: 0, expectedExpenses: 0, netCashFlow: 0, confidence: confidenceLevel },
      n90: { expectedIncome: 0, expectedExpenses: 0, netCashFlow: 0, confidence: confidenceLevel },
      summary: recentTxCount === 0 
        ? "No transaction history found. Add transactions in the dashboard to generate an accurate forecast." 
        : "AI model was busy. Please click generate again."
    };
  }
}

module.exports = {
  callAI,
  detectIntent,
  buildFinancialContext,
  buildSystemPrompt,
  generateInsights,
  forecastCashFlow
};