import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';

export async function createNotification({ userId, title, message, type = 'info', link = null }) {
  const db = getDatabase();
  const id = uuidv4();
  await db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type, link)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, title, message, type, link);
  return id;
}
