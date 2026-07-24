/**
 * Auth Routes with Advanced Security
 * POST /api/auth/register  - create account
 * POST /api/auth/login     - get token
 * GET  /api/auth/me        - fetch profile
 * PATCH /api/auth/profile  - update profile
 * POST /api/auth/change-password
 */

const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const { protect }            = require('../middleware/auth');
const { check, authRules }   = require('../utils/validate');
const { ok, created, badReq, unauth, serverErr } = require('../utils/response');
const { sendWelcomeEmail }   = require('../services/emailService');

// — Constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 30 * 60 * 1000; // 30 minutes

// — Password strength checker
const isStrongPassword = (password) => {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return { minLength, hasUpper, hasLower, hasNumber, hasSpecial,
    isValid: minLength && hasUpper && hasLower && hasNumber && hasSpecial
  };
};

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  });

const userPayload = (u) => ({
  id:         u._id,
  name:       u.name,
  email:      u.email,
  userType:   u.userType,
  plan:       u.plan,
  profile:    u.profile,
  onboarded:  u.onboarded,
  createdAt:  u.createdAt
});

// — Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, userType } = req.body;

    // Basic validation
    if (!name || !email || !password || !userType)
      return badReq(res, 'All fields are required.');

    // Password strength validation
    const strength = isStrongPassword(password);
    if (!strength.isValid) {
      const issues = [];
      if (!strength.minLength) issues.push('at least 8 characters');
      if (!strength.hasUpper)  issues.push('one uppercase letter');
      if (!strength.hasLower)  issues.push('one lowercase letter');
      if (!strength.hasNumber) issues.push('one number');
      if (!strength.hasSpecial) issues.push('one special character (!@#$%^&*)');
      return badReq(res, `Password must have: ${issues.join(', ')}.`);
    }

    // Check if email exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return badReq(res, 'Email already registered.');

    const user = await User.create({ name, email, password, userType });
    try { await sendWelcomeEmail(user); } catch(e) {}

    const token = signToken(user._id);
    return created(res, userPayload(user), { token, message: 'Account created successfully' });
  } catch (err) {
    return serverErr(res, err, 'register');
  }
});

// — Login with account lockout
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return badReq(res, 'Email and password are required.');

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +loginAttempts +lockUntil');
    if (!user) return unauth(res, 'Invalid email or password.');

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return unauth(res, `Account locked. Try again in ${minutesLeft} minute(s).`);
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Increment failed attempts
      user.loginAttempts = (user.loginAttempts || 0) + 1;

      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME);
        user.loginAttempts = 0;
        await user.save({ validateBeforeSave: false });
        return unauth(res, 'Too many failed attempts. Account locked for 30 minutes.');
      }

      const attemptsLeft = MAX_LOGIN_ATTEMPTS - user.loginAttempts;
      await user.save({ validateBeforeSave: false });
      return unauth(res, `Invalid email or password. ${attemptsLeft} attempt(s) remaining.`);
    }

    // Successful login - reset attempts
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id);
    return ok(res, userPayload(user), { token, message: 'Logged in successfully' });
  } catch (err) {
    return serverErr(res, err, 'login');
  }
});

// — Get current user
router.get('/me', protect, (req, res) => ok(res, userPayload(req.user)));

// — Update profile
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

// — Change password
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return badReq(res, 'Both current and new password are required.');

    // Password strength check
    const strength = isStrongPassword(newPassword);
    if (!strength.isValid) {
      const issues = [];
      if (!strength.minLength)  issues.push('at least 8 characters');
      if (!strength.hasUpper)   issues.push('one uppercase letter');
      if (!strength.hasLower)   issues.push('one lowercase letter');
      if (!strength.hasNumber)  issues.push('one number');
      if (!strength.hasSpecial) issues.push('one special character (!@#$%^&*)');
      return badReq(res, `New password must have: ${issues.join(', ')}.`);
    }

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
