/**
 * Transactions Routes — Full CRUD + Analytics
 *
 * GET    /api/transactions              — paginated list with filters
 * POST   /api/transactions              — add one
 * POST   /api/transactions/bulk         — bulk import (CSV upload etc.)
 * GET    /api/transactions/analytics/summary  — dashboard KPIs
 * GET    /api/transactions/analytics/trend    — monthly trend for charts
 * GET    /api/transactions/:id          — get one
 * PATCH  /api/transactions/:id          — update one
 * DELETE /api/transactions/:id          — delete one
 */
const express     = require('express');
const router      = express.Router();
const multer      = require('multer');
const path        = require('path');
const fs          = require('fs');
const Transaction = require('../models/Transaction');
const Insight     = require('../models/Insight');
const { protect } = require('../middleware/auth');
const { check, txRules }                   = require('../utils/validate');
const { ok, created, noData, badReq, serverErr } = require('../utils/response');
const { parseCSV, importTransactions } = require('../services/csvService');

// Configure multer for CSV uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'csv-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || path.extname(file.originalname).toLowerCase() === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.use(protect);

// ── List ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      type, category, startDate, endDate,
      page = 1, limit = 50, sort = '-date', search
    } = req.query;

    const filter = { user: req.user._id };
    if (type)      filter.type     = type;
    if (category)  filter.category = category;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate)   filter.date.$lte = new Date(endDate);
    }
    if (search) filter.description = { $regex: search, $options: 'i' };

    const skip  = (Number(page) - 1) * Number(limit);
    const [txs, total] = await Promise.all([
      Transaction.find(filter).sort(sort).skip(skip).limit(Number(limit)).lean(),
      Transaction.countDocuments(filter)
    ]);

    return ok(res, txs, {
      pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)), limit: Number(limit) }
    });
  } catch (err) {
    return serverErr(res, err, 'tx-list');
  }
});

// ── Get one ──────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const tx = await Transaction.findOne({ _id: req.params.id, user: req.user._id });
    if (!tx) return noData(res, 'Transaction not found');
    return ok(res, tx);
  } catch (err) {
    return serverErr(res, err, 'tx-get');
  }
});

// ── Create ───────────────────────────────────────────────────────────────────
router.post('/', txRules, async (req, res) => {
  if (!check(req, res)) return;
  try {
    const tx = await Transaction.create({ ...req.body, user: req.user._id });

    // Auto-flag: large single expense
    if (tx.type === 'expense' && tx.amount >= 50000) {
      await Insight.create({
        user:            req.user._id,
        type:            'warning',
        priority:        'high',
        title:           `Large expense: ₹${tx.amount.toLocaleString('en-IN')} on ${tx.category}`,
        description:     `A ${tx.category} expense of ₹${tx.amount.toLocaleString('en-IN')} was recorded on ${new Date(tx.date).toLocaleDateString('en-IN')}. Verify this is expected.`,
        relatedCategory: tx.category,
        estimatedImpact: 0
      }).catch(() => {});
    }

    return created(res, tx, 'Transaction saved');
  } catch (err) {
    return serverErr(res, err, 'tx-create');
  }
});

// ── Bulk import ───────────────────────────────────────────────────────────────
router.post('/bulk', async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || !transactions.length)
      return badReq(res, 'Provide a non-empty transactions array.');

    // Cap at 500 per request
    const batch = transactions.slice(0, 500).map(t => ({ ...t, user: req.user._id }));
    const docs  = await Transaction.insertMany(batch, { ordered: false });
    return created(res, { inserted: docs.length }, `${docs.length} transactions imported`);
  } catch (err) {
    return serverErr(res, err, 'tx-bulk');
  }
});

// ── CSV Import ───────────────────────────────────────────────────────────────
router.post('/import-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return badReq(res, 'No CSV file uploaded');
    }

    const filePath = req.file.path;
    
    // Parse CSV file
    const { transactions, errors } = await parseCSV(filePath);
    
    // Import valid transactions
    const importResults = await importTransactions(req.user._id, transactions);
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    return ok(res, {
      summary: {
        totalRows: transactions.length + errors.length,
        successful: importResults.success,
        failed: importResults.failed + errors.length,
        parseErrors: errors.length,
        importErrors: importResults.errors.length
      },
      parseErrors: errors.slice(0, 10), // Return first 10 parse errors
      importErrors: importResults.errors.slice(0, 10) // Return first 10 import errors
    }, {
      message: `Successfully imported ${importResults.success} transactions. ${importResults.failed + errors.length} failed.`
    });
  } catch (err) {
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return serverErr(res, err, 'csv-import');
  }
});

// ── Update ───────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const tx = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!tx) return noData(res, 'Transaction not found');
    return ok(res, tx, { message: 'Transaction updated' });
  } catch (err) {
    return serverErr(res, err, 'tx-update');
  }
});

// ── Delete ───────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const tx = await Transaction.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!tx) return noData(res, 'Transaction not found');
    return ok(res, null, { message: 'Transaction deleted' });
  } catch (err) {
    return serverErr(res, err, 'tx-delete');
  }
});

// ── Analytics: Dashboard KPIs ─────────────────────────────────────────────────
router.get('/analytics/summary', async (req, res) => {
  try {
    const uid = req.user._id;
    const now = new Date();
    const s0  = new Date(now.getFullYear(), now.getMonth(), 1);         // this month
    const s1  = new Date(now.getFullYear(), now.getMonth() - 1, 1);    // last month
    const e1  = new Date(now.getFullYear(), now.getMonth(), 0);         // end last month
    const s3  = new Date(now.getFullYear(), now.getMonth() - 5, 1);    // 6-month window

    const [thisMonth, lastMonth, catBreakdown, monthlyTrend, totalStats] = await Promise.all([
      Transaction.aggregate([
        { $match: { user: uid, date: { $gte: s0 } } },
        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Transaction.aggregate([
        { $match: { user: uid, date: { $gte: s1, $lte: e1 } } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { user: uid, type: 'expense', date: { $gte: s0 } } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 8 }
      ]),
      Transaction.aggregate([
        { $match: { user: uid, date: { $gte: s3 } } },
        { $group: { _id: { yr: { $year: '$date' }, mo: { $month: '$date' }, type: '$type' }, total: { $sum: '$amount' } } },
        { $sort: { '_id.yr': 1, '_id.mo': 1 } }
      ]),
      Transaction.aggregate([
        { $match: { user: uid } },
        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ])
    ]);

    const g = (arr, t) => arr.find(a => a._id === t)?.total || 0;
    const c = (arr, t) => arr.find(a => a._id === t)?.count || 0;
    const pct = (a, b) => b ? +((a - b) / b * 100).toFixed(1) : null;

    const tmInc = g(thisMonth, 'income'),  tmExp = g(thisMonth, 'expense');
    const lmInc = g(lastMonth, 'income'),  lmExp = g(lastMonth, 'expense');

    return ok(res, {
      thisMonth:  { income: tmInc, expenses: tmExp, profit: tmInc - tmExp, txCount: c(thisMonth,'income') + c(thisMonth,'expense') },
      lastMonth:  { income: lmInc, expenses: lmExp, profit: lmInc - lmExp },
      changes:    { income: pct(tmInc, lmInc), expenses: pct(tmExp, lmExp), profit: pct(tmInc - tmExp, lmInc - lmExp) },
      allTime:    { income: g(totalStats,'income'), expenses: g(totalStats,'expense'), txCount: c(totalStats,'income') + c(totalStats,'expense') },
      categoryBreakdown: catBreakdown,
      monthlyTrend
    });
  } catch (err) {
    return serverErr(res, err, 'tx-summary');
  }
});

// ── Analytics: Monthly trend for charts ──────────────────────────────────────
router.get('/analytics/trend', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6;
    const start  = new Date();
    start.setMonth(start.getMonth() - months + 1);
    start.setDate(1);

    const trend = await Transaction.aggregate([
      { $match: { user: req.user._id, date: { $gte: start } } },
      { $group: { _id: { yr: { $year: '$date' }, mo: { $month: '$date' }, type: '$type' }, total: { $sum: '$amount' } } },
      { $sort: { '_id.yr': 1, '_id.mo': 1 } }
    ]);
    return ok(res, trend);
  } catch (err) {
    return serverErr(res, err, 'tx-trend');
  }
});

module.exports = router;
