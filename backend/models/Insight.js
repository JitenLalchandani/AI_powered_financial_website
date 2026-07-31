const mongoose = require('mongoose');

const insightSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['saving', 'risk', 'opportunity', 'warning', 'achievement'],
    required: true
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  title: { type: String, required: true, maxlength: 120 },
  description: { type: String, required: true },
  estimatedImpact: Number,     // in currency units
  impactType: {
    type: String,
    enum: ['saving', 'revenue', 'risk_reduction', 'time'],
    default: 'saving'
  },
  actionTaken: { type: Boolean, default: false },
  dismissed: { type: Boolean, default: false },
  relatedCategory: String,
  generatedBy: {
    type: String,
    enum: ['ai_analysis', 'system', 'manual'],
    default: 'ai_analysis'
  },
  createdAt: { type: Date, default: Date.now },
  expiresAt: Date
});

module.exports = mongoose.model('Insight', insightSchema);
