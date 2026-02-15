import { verifyAccessToken } from '../config/auth.js';
import { getDatabase } from '../config/database.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Verify user still exists and is active
  const db = getDatabase();
  const user = db.prepare('SELECT id, email, name, role, is_active FROM users WHERE id = ?').get(decoded.id);

  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'User not found or inactive' });
  }

  req.user = user;
  next();
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  if (decoded) {
    const db = getDatabase();
    const user = db.prepare('SELECT id, email, name, role, is_active FROM users WHERE id = ?').get(decoded.id);
    if (user && user.is_active) {
      req.user = user;
    }
  }

  next();
}

export default { authenticate, optionalAuth };
