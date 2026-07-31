const { forecastCashFlow, generateInsights } = require('../services/aiService');
const Transaction = require('../models/Transaction');

exports.getForecast = async (req, res) => {
  try {
    const result = await forecastCashFlow(req.user, Transaction);
    return res.json(result);
  } catch (error) {
    console.error('Forecast route error:', error);
    return res.status(500).json({
      n30: {
        expectedIncome: 0,
        expectedExpenses: 0,
        netCashFlow: 0,
        runwayDays: 0,
        summary: "Error generating cash flow forecast."
      }
    });
  }
};

exports.getInsights = async (req, res) => {
  try {
    const insights = await generateInsights(req.user, Transaction);
    return res.json(insights);
  } catch (error) {
    console.error('Insights route error:', error);
    return res.status(500).json({ error: 'Failed to generate insights' });
  }
};
