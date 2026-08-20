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

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Please log in.' });
  }

  try {
    // Throws if the token is fake, tampered with, or expired.
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
}

// requireRole('admin') returns a NEW middleware function that only lets
// admins through. requireRole('admin', 'buyer') accepts either role.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Your account type cannot do that.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
