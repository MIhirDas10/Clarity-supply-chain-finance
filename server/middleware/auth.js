// Two small functions that guard a route.
//
//   requireAuth        - you must be logged in
//   requireRole('admin') - you must be logged in AND have that role
//
// A logged-in user is proven by a JWT (JSON Web Token). The browser sends it
// back on every request as  Authorization: Bearer <token>.  The server never
// stores sessions itself - the token IS the proof, and jwt.verify() checks
// it was really issued by this server and has not expired.

const jwt = require('jsonwebtoken');
const pool = require('../db');

// Base auth logic that verifies token and checks if user exists/rejected
async function baseRequireAuth(req, res, next, allowPaused = false) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await pool.query('SELECT status, is_paused FROM users WHERE id = $1', [decoded.id]);
    
    if (result.rowCount === 0) {
      return res.status(401).json({ message: 'Account no longer exists.' });
    }
    
    const userStatus = result.rows[0];
    
    if (userStatus.status === 'Rejected') {
      return res.status(403).json({ message: 'Your account has been rejected.' });
    }
    
    if (!allowPaused && userStatus.is_paused) {
      return res.status(403).json({ message: 'Your account is currently paused.' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
}

async function requireAuth(req, res, next) {
  return baseRequireAuth(req, res, next, false);
}

async function requireAuthAllowPaused(req, res, next) {
  return baseRequireAuth(req, res, next, true);
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Your account type cannot do that.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireAuthAllowPaused, requireRole };
