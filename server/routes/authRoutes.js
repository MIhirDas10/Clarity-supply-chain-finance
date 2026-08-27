// Login, Signup & Admin Approval   (Common Workflow, shared by the whole team)
// Mounted at /api/auth
//
//   POST  /api/auth/signup           anyone - create a Pending account
//   POST  /api/auth/login            anyone - only Approved accounts succeed
//   GET   /api/auth/me               logged in - who am I right now
//   GET   /api/auth/pending          admin only - the approval queue
//   GET   /api/auth/users            admin only - every account
//   PATCH /api/auth/:id/approve      admin only
//   PATCH /api/auth/:id/reject       admin only

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, requireAuthAllowPaused, requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_SIGNUP_ROLES = ['supplier', 'buyer', 'funder'];

// A JWT that lasts 7 days. Anything the app needs to check on every request
// (id, role, business_name) is baked into the token, so most requests never
// have to touch the database just to know who is asking.
function issueToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, business_name: user.business_name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// 1. POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { role, business_name, email, phone, password } = req.body;

  if (!role || !business_name || !email || !password) {
    return res.status(400).json({ message: 'role, business_name, email and password are required' });
  }
  if (!VALID_SIGNUP_ROLES.includes(role)) {
    // Admin accounts are never created through this public form - that would
    // let anyone grant themselves full platform control.
    return res.status(400).json({ message: 'role must be "supplier", "buyer" or "funder"' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'password must be at least 6 characters' });
  }

  const normalisedEmail = email.trim().toLowerCase();

  try {
    const clash = await pool.query('SELECT id FROM users WHERE email = $1', [normalisedEmail]);
    if (clash.rowCount > 0) {
      return res.status(409).json({ message: 'An account with that email already exists' });
    }

    // Never store the real password - only a one-way hash of it. 10 "salt
    // rounds" is bcrypt's standard cost; higher is slower but harder to crack.
    const passwordHash = await bcrypt.hash(password, 10);

    const initialStatus = role === 'funder' ? 'Pending' : 'Approved';

    const saved = await pool.query(
      `INSERT INTO users (role, business_name, email, phone, password_hash, status, is_paused, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, CASE WHEN $6 = 'Approved' THEN NOW() ELSE NULL END)
       RETURNING id, role, business_name, email, status, created_at, approved_at, is_paused, pause_reason`,
      [role, business_name, normalisedEmail, phone || null, passwordHash, initialStatus]
    );

    res.status(201).json({
      message: 'Application submitted. An admin will review it within 48 hours.',
      user: saved.rows[0],
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not create the account' });
  }
});

// 2. POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  try {
    const found = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    // Deliberately the same message for "no such email" and "wrong password".
    // Telling an attacker which one is true would confirm which emails have
    // accounts on the platform.
    if (found.rowCount === 0) {
      return res.status(401).json({ message: 'Incorrect email or password' });
    }

    const user = found.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Incorrect email or password' });
    }

    if (user.status === 'Pending') {
      return res.status(403).json({ message: 'Your application is still awaiting admin approval.' });
    }
    if (user.status === 'Rejected') {
      return res.status(403).json({ message: 'Your application was not approved. Contact the platform admin.' });
    }

    const token = issueToken(user);
    res.json({
      token,
      user: { id: user.id, role: user.role, business_name: user.business_name, email: user.email, is_paused: user.is_paused, pause_reason: user.pause_reason },
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not log in' });
  }
});

// 3. GET /api/auth/me - re-reads the database rather than trusting the token
//    alone, so a user who was just Rejected cannot keep using an old token.
router.get('/me', requireAuthAllowPaused, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, role, business_name, email, status, is_paused, pause_reason FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Account no longer exists' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Could not load your account' });
  }
});

// 4. GET /api/auth/pending - admin's approval queue
router.get('/pending', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, role, business_name, email, phone, created_at, is_paused, pause_reason
       FROM users WHERE status = 'Pending' ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not load the approval queue' });
  }
});

// 5. GET /api/auth/users - every account, for the admin's oversight table
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, role, business_name, email, phone, status, created_at, approved_at, is_paused, pause_reason
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not load the user list' });
  }
});

// GET /api/auth/buyers - fetch all buyers dynamically
router.get('/buyers', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT business_name FROM users WHERE role = 'buyer' AND status = 'Approved' ORDER BY business_name ASC`
    );
    res.json(result.rows.map(row => row.business_name));
  } catch (error) {
    res.status(500).json({ message: 'Could not load the buyers list' });
  }
});

// GET /api/auth/banks - fetch comprehensive list of banks in Bangladesh
router.get('/banks', (req, res) => {
  const banks = [
    { id: 'bb', name: 'Bangladesh Bank' },
    { id: 'sonali', name: 'Sonali Bank PLC' },
    { id: 'janata', name: 'Janata Bank PLC' },
    { id: 'agrani', name: 'Agrani Bank PLC' },
    { id: 'rupali', name: 'Rupali Bank PLC' },
    { id: 'basic', name: 'BASIC Bank Limited' },
    { id: 'brac', name: 'BRAC Bank PLC' },
    { id: 'city', name: 'The City Bank PLC' },
    { id: 'ebl', name: 'Eastern Bank PLC' },
    { id: 'prime', name: 'Prime Bank PLC' },
    { id: 'dutch', name: 'Dutch-Bangla Bank PLC' },
    { id: 'islami', name: 'Islami Bank Bangladesh PLC' },
    { id: 'scb', name: 'Standard Chartered Bank' },
    { id: 'hsbc', name: 'HSBC Bangladesh' },
    { id: 'ab', name: 'AB Bank PLC' },
    { id: 'ific', name: 'IFIC Bank PLC' },
    { id: 'pubali', name: 'Pubali Bank PLC' },
    { id: 'uttara', name: 'Uttara Bank PLC' },
    { id: 'mtb', name: 'Mutual Trust Bank PLC' },
    { id: 'dhaka', name: 'Dhaka Bank PLC' },
    { id: 'bankasia', name: 'Bank Asia PLC' },
    { id: 'trust', name: 'Trust Bank Limited' },
    { id: 'ncc', name: 'NCC Bank PLC' },
    { id: 'ucb', name: 'United Commercial Bank PLC' },
    { id: 'nrb', name: 'NRB Bank Limited' },
    { id: 'midland', name: 'Midland Bank Limited' },
    { id: 'jamuna', name: 'Jamuna Bank PLC' },
    { id: 'exim', name: 'EXIM Bank PLC' },
    { id: 'sib', name: 'Social Islami Bank PLC' },
    { id: 'shahjalal', name: 'Shahjalal Islami Bank PLC' }
  ];
  // Sort alphabetically by name
  banks.sort((a, b) => a.name.localeCompare(b.name));
  res.json(banks);
});

// 6. PATCH /api/auth/:id/approve
router.patch('/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const updated = await pool.query(
      `UPDATE users SET status = 'Approved', approved_at = NOW()
       WHERE id = $1 AND status = 'Pending'
       RETURNING id, business_name, email, role, status`,
      [req.params.id]
    );
    if (updated.rowCount === 0) {
      return res.status(409).json({ message: 'No pending account with that id' });
    }
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Approve Error:', error);
    res.status(500).json({ message: 'Could not approve that account' });
  }
});

// 7. PATCH /api/auth/:id/reject
router.patch('/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const updated = await pool.query(
      `UPDATE users SET status = 'Rejected'
       WHERE id = $1 AND status = 'Pending'
       RETURNING id, business_name, email, role, status`,
      [req.params.id]
    );
    if (updated.rowCount === 0) {
      return res.status(409).json({ message: 'No pending account with that id' });
    }
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Reject Error:', error);
    res.status(500).json({ message: 'Could not reject that account' });
  }
});

// 8. PATCH /api/auth/:id/pause
router.patch('/:id/pause', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const reason = req.body ? req.body.reason : null;
    const updated = await pool.query(
      `UPDATE users SET is_paused = true, pause_reason = $1
       WHERE id = $2
       RETURNING id, business_name, email, role, status, is_paused, pause_reason`,
      [reason || null, req.params.id]
    );
    if (updated.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Pause Error:', error);
    res.status(500).json({ message: 'Could not pause that account' });
  }
});

// 9. PATCH /api/auth/:id/unpause
router.patch('/:id/unpause', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const updated = await pool.query(
      `UPDATE users SET is_paused = false, pause_reason = null
       WHERE id = $1
       RETURNING id, business_name, email, role, status, is_paused, pause_reason`,
      [req.params.id]
    );
    if (updated.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Unpause Error:', error);
    res.status(500).json({ message: 'Could not unpause that account' });
  }
});

// 10. DELETE /api/auth/:id
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await pool.query(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (deleted.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ message: 'Could not delete that account' });
  }
});

module.exports = router;
