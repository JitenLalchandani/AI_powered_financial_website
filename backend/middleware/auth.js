const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const { unauth } = require('../utils/response');

/**
 * Protect — require a valid Bearer JWT token on every request
 */
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return unauth(res, 'Not authorised — please log in.');
    }
    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id);
    if (!user) return unauth(res, 'Account no longer exists.');
    req.user = user;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Session expired — please log in again.'
      : 'Invalid token — please log in.';
    return unauth(res, msg);
  }
};

/**
 * requirePlan — gate a route to specific subscription tiers
 */
const requirePlan = (...plans) => (req, res, next) => {
  if (!plans.includes(req.user.plan)) {
    return res.status(403).json({
      success: false,
      message: `This feature requires the ${plans.join(' or ')} plan.`
    });
  }
  next();
};

module.exports = { protect, requirePlan };
