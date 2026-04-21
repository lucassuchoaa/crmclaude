import express from 'express';
import crypto from 'crypto';
import { getDatabase } from '../config/database.js';
import {
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashPassword
} from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const db = getDatabase();
    const user = await db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login timestamp
    await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
      .run(new Date().toISOString(), user.id);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token hash (never store the raw JWT)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
      .run(user.id, hashRefreshToken(refreshToken), expiresAt);

    // Clean up old refresh tokens for this user
    await db.prepare('DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at < ?')
      .run(user.id, new Date().toISOString());

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        must_change_password: !!user.must_change_password
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const db = getDatabase();

    // Verify token hash exists in database
    const tokenHash = hashRefreshToken(refreshToken);
    const storedToken = await db.prepare('SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > ?')
      .get(tokenHash, new Date().toISOString());

    if (!storedToken) {
      return res.status(401).json({ error: 'Refresh token not found or expired' });
    }

    // Get user
    const user = await db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new tokens (token rotation)
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Delete old refresh token (by hash)
    await db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(tokenHash);

    // Store new refresh token hash
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
      .run(user.id, hashRefreshToken(newRefreshToken), expiresAt);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const db = getDatabase();

    // Delete ALL refresh tokens for this user (full logout from all devices)
    await db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.id);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const user = await db.prepare(`
      SELECT id, email, name, role, avatar, manager_id, must_change_password, created_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Change password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 10) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' });
    }
    // Require at least 3 of: lowercase, uppercase, digit, symbol
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(newPassword)).length;
    if (classes < 3) {
      return res.status(400).json({ error: 'Password must contain at least 3 of: lowercase, uppercase, number, symbol' });
    }

    const db = getDatabase();
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    const isValid = await comparePassword(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await hashPassword(newPassword);
    await db.prepare('UPDATE users SET password = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
      .run(hashedPassword, new Date().toISOString(), req.user.id);

    // Invalidate all refresh tokens for this user
    await db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.id);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Password change failed' });
  }
});

export default router;
