/**
 * Auth Routes
 * POST /api/auth/register  — create account
 * POST /api/auth/login     — get token
 * GET  /api/auth/me        — fetch profile
 * PATCH /api/auth/profile  — update profile
 * POST /api/auth/change-password
 */
const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { protect }          = require('../middleware/auth');
const { check, authRules } = require('../utils/validate');
const { ok, created, badReq, unauth, serverErr } = require('../utils/response');
const { sendWelcomeEmail } = require('../services/emailService');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  });

const userPayload = (u) => ({
  id:       u._id,
  name:     u.name,
  email:    u.email,
  userType: u.userType,
  plan:     u.plan,
  profile:  u.profile,
  onboarded: u.onboarded,
  createdAt: u.createdAt
});

// ── Register ─────────────────────────────────────────────────────────────────
router.post('/register', authRules.register, async (req, res) => {
  if (!check(req, res)) return;
  try {
    const { name, email, password, userType } = req.body;

    if (await User.findOne({ email })) {
      return badReq(res, 'An account with this email already exists. Please log in.');
    }

    const user  = await User.create({ name, email, password, userType });
    const token = signToken(user._id);

    // Send welcome email (async, don't wait for it)
    sendWelcomeEmail(user).catch(err => {
      console.error('Failed to send welcome email:', err);
    });

    return created(res, userPayload(user), 'Account created successfully', { token });
  } catch (err) {
    return serverErr(res, err, 'register');
  }
});

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', authRules.login, async (req, res) => {
  if (!check(req, res)) return;
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return unauth(res, 'Incorrect email or password. Please try again.');
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id);
    return ok(res, userPayload(user), { token, message: 'Logged in successfully' });
  } catch (err) {
    return serverErr(res, err, 'login');
  }
});

// ── Get current user ─────────────────────────────────────────────────────────
router.get('/me', protect, (req, res) => ok(res, userPayload(req.user)));

// ── Update profile ────────────────────────────────────────────────────────────
router.patch('/profile', protect, async (req, res) => {
  try {
    const allowed = ['name', 'profile', 'onboarded'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true, runValidators: true
    });
    return ok(res, userPayload(user), { message: 'Profile updated' });
  } catch (err) {
    return serverErr(res, err, 'profile-update');
  }
});

// ── Change password ───────────────────────────────────────────────────────────
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return badReq(res, 'Both current and new password are required.');
    if (newPassword.length < 6)
      return badReq(res, 'New password must be at least 6 characters.');

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword)))
      return unauth(res, 'Current password is incorrect.');

    user.password = newPassword;
    await user.save();
    return ok(res, null, { message: 'Password changed successfully.' });
  } catch (err) {
    return serverErr(res, err, 'change-password');
  }
});

module.exports = router;
