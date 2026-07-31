const https = require('https');

const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS, 10) || 500;

// ─────────────────────────────────────────────────────────────────────────────
//  1. OpenRouter API
// ─────────────────────────────────────────────────────────────────────────────
function callOpenRouter(userMessage, systemPrompt, maxTokens = MAX_TOKENS, requiresJSON = false) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return reject(new Error('OPENROUTER_API_KEY is missing'));

    const body = JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free',
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
          reject(new Error('Unexpected OpenRouter response structure'));
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
//  2. Hugging Face Inference API
// ─────────────────────────────────────────────────────────────────────────────
function callHuggingFace(userMessage, systemPrompt, maxTokens = MAX_TOKENS, requiresJSON = false) {
  return new Promise((resolve, reject) => {
    const token = process.env.HF_API_TOKEN;
    if (!token) return reject(new Error('HF_API_TOKEN is missing'));

    const model = process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';
    const prompt = `<s>[INST] ${systemPrompt}\n\n${userMessage} [/INST]`;

    const body = JSON.stringify({
      inputs: prompt,
      parameters: { max_new_tokens: maxTokens, temperature: 0.7, return_full_text: false }
    });

    const req = https.request({
      hostname: 'api-inference.huggingface.co',
      path: `/models/${model}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) return reject(new Error(`HuggingFace: ${parsed.error}`));
          if (Array.isArray(parsed) && parsed[0]?.generated_text) return resolve(parsed[0].generated_text);
          reject(new Error('Unexpected Hugging Face response format'));
        } catch (e) {
          reject(new Error('Could not parse HuggingFace response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. Ollama API (Local AI)
// ─────────────────────────────────────────────────────────────────────────────
function callOllama(userMessage, systemPrompt, maxTokens = MAX_TOKENS, requiresJSON = false) {
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
//  4. Unified Fallback AI Caller
// ─────────────────────────────────────────────────────────────────────────────
async function callAI(messages, systemPrompt, maxTokens = MAX_TOKENS, requiresJSON = false) {
  const errors = [];
  const userMsg = typeof messages === 'string' ? messages : messages[messages.length - 1]?.content || '';

  // 1. Try Ollama (Local)
  try {
    const result = await callOllama(userMsg, systemPrompt, maxTokens, requiresJSON);
    console.log('[AI] ✓ Ollama succeeded');
    return result;
  } catch (e) {
    errors.push(`Ollama: ${e.message}`);
    console.log('[AI] x Ollama failed:', e.message);
  }

  // 2. Try OpenRouter
  try {
    const result = await callOpenRouter(userMsg, systemPrompt, maxTokens, requiresJSON);
    console.log('[AI] ✓ OpenRouter succeeded');
    return result;
  } catch (e) {
    errors.push(`OpenRouter: ${e.message}`);
    console.log('[AI] x OpenRouter failed:', e.message);
  }

  // 3. Try Hugging Face
  try {
    const result = await callHuggingFace(userMsg, systemPrompt, maxTokens, requiresJSON);
    console.log('[AI] ✓ Hugging Face succeeded');
    return result;
  } catch (e) {
    errors.push(`HuggingFace: ${e.message}`);
    console.log('[AI] x Hugging Face failed:', e.message);
  }

  // 4. Fallback to Mock Response
  console.log('[AI] Falling back to Mock AI');
  return getMockAIResponse(userMsg, systemPrompt);
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. Mock AI (Development/Testing Fallback)
// ─────────────────────────────────────────────────────────────────────────────
function getMockAIResponse(userMessage, systemPrompt) {
  const msg = userMessage.toLowerCase();

  if (msg.match(/^(hello|hi|hey|good morning|good evening|namaste)[\s!?]*$/i)) {
    return "Hello! I'm FinWise AI, your personal financial advisor for India. How can I help you manage your finances today?";
  }

  if (msg.match(/reduce.*expense|cut.*cost|lower.*spending|decrease.*expense/i)) {
    return "Here are practical ways to reduce your expenses:\n\n1. **Track Subscriptions**: Cancel unused streaming/app services.\n2. **50/30/20 Rule**: Allocate 50% to needs, 30% to wants, and 20% to savings.\n3. **Review Dining Out**: Limit food delivery and restaurant spending.";
  }

  return "I've analyzed your financial query. Based on your current transaction history and spending trends, keeping a close eye on discretionary categories and building a 3-to-6 month emergency buffer is recommended.";
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. Insights Generator
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

module.exports = {
  callAI,
  generateInsights
};