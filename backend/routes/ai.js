/**
 * AI Routes  —  /api/ai/*
 * POST   /chat                  send message, get reply, persist to MongoDB
 * POST   /quick-advice          one-shot advice (no history saved)
 * GET    /conversations          list user's conversations
 * GET    /conversations/:id      load full conversation
 * DELETE /conversations/:id      delete conversation
 * POST   /analyse               run full analysis → save insights to MongoDB
 * GET    /insights               list insights from MongoDB
 * PATCH  /insights/:id           mark actioned / dismissed
 * GET    /forecast               30 & 90-day cash flow forecast
 */
const express      = require('express');
const router       = express.Router();
const Conversation = require('../models/Conversation');
const Transaction  = require('../models/Transaction');
const Insight      = require('../models/Insight');
const { protect }  = require('../middleware/auth');
const aiService    = require('../services/aiService');
const { ok, noData, badReq, serverErr } = require('../utils/response');

router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
//  CHAT  —  full conversation with context + MongoDB persistence
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message?.trim()) return badReq(res, 'Message cannot be empty.');

    // Load existing or create new conversation in MongoDB
    let convo = conversationId
      ? await Conversation.findOne({ _id: conversationId, user: req.user._id })
      : null;
    if (!convo) {
      convo = new Conversation({ user: req.user._id, messages: [], title: 'New conversation' });
    }

    // Call Claude with financial context from MongoDB
    const { reply, intent } = await aiService.chat(
      convo.messages, message.trim(), req.user, Transaction
    );

    // Persist user + assistant messages
    convo.messages.push({ role: 'user',      content: message.trim() });
    convo.messages.push({ role: 'assistant', content: reply });

    // Auto-set title from first message
    if (convo.messages.length === 2) {
      convo.title = message.length > 65 ? message.slice(0, 62) + '…' : message;
    }
    // Tag the topic
    if (intent && intent !== 'general' && intent !== 'greeting') {
      convo.topic = intent.includes('cost') ? 'cost_reduction'
        : ['profit','cash_flow','risk','decision','savings'].includes(intent) ? intent
        : 'general';
    }

    await convo.save();

    // Background: persist any financial insight extracted from the reply
    const lower = reply.toLowerCase();
    const hasInsight = lower.match(/\b(sav(e|ing|ings)|cut|reduc(e|tion)|risk|opportunit|wasteful|overcharg)\b/);
    if (hasInsight) {
      const rupeeMatch = reply.match(/₹[\d,]+/);
      const impact     = rupeeMatch ? parseInt(rupeeMatch[0].replace(/[₹,]/g, '')) : 0;
      Insight.create({
        user:        req.user._id,
        type:        lower.includes('risk') ? 'risk' : 'saving',
        priority:    impact > 15000 ? 'high' : impact > 5000 ? 'medium' : 'low',
        title:       `AI tip: ${convo.title?.slice(0, 60) || 'Financial advice'}`,
        description: reply.replace(/\*\*/g, '').slice(0, 195),
        estimatedImpact: impact,
        impactType:  'saving',
        generatedBy: 'ai_analysis'
      }).catch(() => {});
    }

    return ok(res, { reply, conversationId: convo._id, intent });
  } catch (err) {
    console.error('[ai/chat]', err.message);
    const isKey = err.message.includes('ANTHROPIC_API_KEY');
    return res.status(isKey ? 503 : 500).json({
      success: false,
      message: isKey
        ? 'AI not configured — add your ANTHROPIC_API_KEY to backend/.env'
        : err.message
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  QUICK ADVICE  —  single question, no history stored
// ─────────────────────────────────────────────────────────────────────────────
router.post('/quick-advice', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) return badReq(res, 'Question is required.');
    const { reply, intent } = await aiService.quickAdvice(question.trim(), req.user, Transaction);
    return ok(res, { reply, intent });
  } catch (err) {
    return serverErr(res, err, 'ai/quick-advice');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  CONVERSATIONS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/conversations', async (req, res) => {
  try {
    const convos = await Conversation.find({ user: req.user._id })
      .select('title topic messages createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(30).lean();

    return ok(res, convos.map(c => ({
      id:           c._id,
      title:        c.title,
      topic:        c.topic,
      messageCount: c.messages.length,
      lastMessage:  c.messages.at(-1)?.content?.slice(0, 80) || '',
      updatedAt:    c.updatedAt,
      createdAt:    c.createdAt
    })));
  } catch (err) {
    return serverErr(res, err, 'ai/conversations');
  }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.id, user: req.user._id });
    if (!convo) return noData(res, 'Conversation not found');
    return ok(res, convo);
  } catch (err) {
    return serverErr(res, err, 'ai/conversations/:id');
  }
});

router.delete('/conversations/:id', async (req, res) => {
  try {
    const del = await Conversation.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!del) return noData(res, 'Conversation not found');
    return ok(res, null, { message: 'Conversation deleted' });
  } catch (err) {
    return serverErr(res, err, 'ai/conversations/delete');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  FULL FINANCIAL ANALYSIS → INSIGHTS (saved to MongoDB)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/analyse', async (req, res) => {
  try {
    const count = await Transaction.countDocuments({ user: req.user._id });
    if (count < 3) return badReq(res, 'Add at least 3 transactions first, then run an analysis.');

    const rawInsights = await aiService.generateInsights(req.user, Transaction);
    if (!rawInsights.length) return ok(res, [], { message: 'Analysis done — no new insights at this time.' });

    const saved = (await Promise.all(
      rawInsights.map(ins =>
        Insight.create({ ...ins, user: req.user._id, generatedBy: 'ai_analysis' }).catch(() => null)
      )
    )).filter(Boolean);

    return ok(res, saved, { message: `${saved.length} personalised insights generated from your MongoDB data.` });
  } catch (err) {
    console.error('[ai/analyse]', err.message);
    const isKey = err.message.includes('ANTHROPIC_API_KEY');
    return res.status(isKey ? 503 : 500).json({
      success: false,
      message: isKey ? 'AI not configured — add ANTHROPIC_API_KEY to .env' : err.message
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  INSIGHTS  —  read & update
// ─────────────────────────────────────────────────────────────────────────────
router.get('/insights', async (req, res) => {
  try {
    const filter = { user: req.user._id, dismissed: false };
    if (req.query.type)     filter.type     = req.query.type;
    if (req.query.priority) filter.priority = req.query.priority;

    const insights = await Insight.find(filter)
      .sort({ priority: 1, createdAt: -1 })
      .limit(Number(req.query.limit) || 25);

    return ok(res, insights);
  } catch (err) {
    return serverErr(res, err, 'ai/insights');
  }
});

router.patch('/insights/:id', async (req, res) => {
  try {
    const updates = {};
    ['actionTaken', 'dismissed'].forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const insight = await Insight.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: updates },
      { new: true }
    );
    if (!insight) return noData(res, 'Insight not found');
    return ok(res, insight, { message: 'Insight updated' });
  } catch (err) {
    return serverErr(res, err, 'ai/insights/patch');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  CASH FLOW FORECAST
// ─────────────────────────────────────────────────────────────────────────────
router.get('/forecast', async (req, res) => {
  try {
    const count = await Transaction.countDocuments({ user: req.user._id });
    if (count < 3) return badReq(res, 'Add at least 3 transactions to generate a forecast.');
    const forecast = await aiService.forecastCashFlow(req.user, Transaction);
    if (!forecast) return ok(res, null, { message: 'Not enough historical data for a reliable forecast yet.' });
    return ok(res, forecast);
  } catch (err) {
    return serverErr(res, err, 'ai/forecast');
  }
});

module.exports = router;
