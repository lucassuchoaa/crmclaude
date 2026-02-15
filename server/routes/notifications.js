import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
// hasPermission import available for future use
import { authenticate } from '../middleware/auth.js';
import { requireMinRole } from '../middleware/rbac.js';

const router = express.Router();

// Get notifications for current user
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { unread_only, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT * FROM notifications
      WHERE user_id = ?
    `;
    const params = [req.user.id];

    if (unread_only === 'true') {
      query += ` AND is_read = 0`;
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const notifications = db.prepare(query).all(...params);

    // Get unread count
    const { unread_count } = db.prepare(`
      SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = 0
    `).get(req.user.id);

    res.json({ notifications, unread_count });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Mark all notifications as read
router.post('/read-all', authenticate, (req, res) => {
  try {
    const db = getDatabase();

    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// Delete notification
router.delete('/:id', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Delete all read notifications
router.delete('/', authenticate, (req, res) => {
  try {
    const db = getDatabase();

    db.prepare('DELETE FROM notifications WHERE user_id = ? AND is_read = 1').run(req.user.id);

    res.json({ message: 'Read notifications deleted' });
  } catch (error) {
    console.error('Delete notifications error:', error);
    res.status(500).json({ error: 'Failed to delete notifications' });
  }
});

// Send notification (admin only)
router.post('/send', authenticate, requireMinRole('diretor'), (req, res) => {
  try {
    const { user_id, user_ids, title, message, type = 'info', link } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message required' });
    }

    if (!user_id && !user_ids) {
      return res.status(400).json({ error: 'User ID or user IDs required' });
    }

    const db = getDatabase();
    const targetUsers = user_ids || [user_id];
    const notifications = [];

    for (const uid of targetUsers) {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, uid, title, message, type, link || null);

      notifications.push({ id, user_id: uid, title, message, type, link });
    }

    res.status(201).json({ notifications });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Broadcast notification to role
router.post('/broadcast', authenticate, requireMinRole('executivo'), (req, res) => {
  try {
    const { roles, title, message, type = 'info', link } = req.body;

    if (!title || !message || !roles) {
      return res.status(400).json({ error: 'Title, message and roles required' });
    }

    const db = getDatabase();

    // Get users by roles
    const placeholders = roles.map(() => '?').join(',');
    const users = db.prepare(`
      SELECT id FROM users WHERE role IN (${placeholders}) AND is_active = 1
    `).all(...roles);

    const notifications = [];

    for (const user of users) {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, user.id, title, message, type, link || null);

      notifications.push({ id, user_id: user.id });
    }

    res.status(201).json({
      message: `Notification sent to ${notifications.length} users`,
      count: notifications.length
    });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({ error: 'Failed to broadcast notification' });
  }
});

export default router;
