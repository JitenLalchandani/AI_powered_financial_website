const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be positive']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      // Income
      'sales', 'service', 'investment', 'grant', 'salary', 'freelance', 'rental', 'other_income',
      // Expense
      'rent', 'utilities', 'salaries', 'marketing', 'supplies', 'software', 'transport',
      'food', 'healthcare', 'education', 'entertainment', 'insurance', 'loan_repayment',
      'taxes', 'maintenance', 'subscription', 'vendor', 'other_expense'
    ]
  },
  description: {
    type: String,
    trim: true,
    maxlength: [300, 'Description too long']
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  vendor: String,
  tags: [String],
  recurring: {
    isRecurring: { type: Boolean, default: false },
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] }
  },
  aiFlag: {
    isFlagged: { type: Boolean, default: false },
    reason: String,           // e.g. "Unusually high", "Potential duplicate"
    savingOpportunity: Number // estimated saving in currency
  },
  createdAt: { type: Date, default: Date.now }
});

// Indexes for fast queries
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, type: 1, category: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
