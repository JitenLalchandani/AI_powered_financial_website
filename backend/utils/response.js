/**
 * Consistent API response helpers
 */
const ok = (res, data, meta = {}) =>
  res.json({ success: true, ...meta, data });

const created = (res, data, msg = 'Created', meta = {}) =>
  res.status(201).json({ success: true, message: msg, ...meta, data });

const noData = (res, msg = 'Not found') =>
  res.status(404).json({ success: false, message: msg });

const badReq = (res, msg) =>
  res.status(400).json({ success: false, message: msg });

const unauth = (res, msg = 'Not authorised') =>
  res.status(401).json({ success: false, message: msg });

const serverErr = (res, err, context = '') => {
  const msg = err?.message || 'Server error';
  console.error(`[${context || 'API'}] ${msg}`);
  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again.'
      : msg
  });
};

module.exports = { ok, created, noData, badReq, unauth, serverErr };
