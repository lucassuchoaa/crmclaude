import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';

/**
 * Trigger workflow automations based on events.
 * Called from leads routes, cadence runner, and landing page submissions.
 */
export async function triggerWorkflow(eventType, eventData) {
  const db = getDatabase();
  const now = new Date().toISOString();

  const workflows = await db.prepare(
    'SELECT * FROM workflow_automations WHERE trigger_type = ? AND is_active = 1'
  ).all(eventType);

  for (const workflow of workflows) {
    try {
      const triggerConfig = JSON.parse(workflow.trigger_config || '{}');
      const actions = JSON.parse(workflow.actions || '[]');

      // Check trigger conditions
      if (!matchesTriggerConfig(triggerConfig, eventData)) continue;

      // Execute actions
      for (const action of actions) {
        await executeAction(db, action, eventData, now);
      }

      // Update execution count
      await db.prepare(
        'UPDATE workflow_automations SET execution_count = execution_count + 1, last_executed_at = ?, updated_at = ? WHERE id = ?'
      ).run(now, now, workflow.id);

    } catch (err) {
      console.error(`[WorkflowEngine] Error executing workflow ${workflow.id}:`, err.message);
    }
  }
}

function matchesTriggerConfig(config, eventData) {
  if (!config || Object.keys(config).length === 0) return true;

  // Check specific field conditions
  for (const [key, value] of Object.entries(config)) {
    if (key === 'source' && eventData.source && eventData.source !== value) return false;
    if (key === 'status' && eventData.status && eventData.status !== value) return false;
    if (key === 'min_score' && eventData.total_score !== undefined && Number(eventData.total_score) < Number(value)) return false;
    if (key === 'landing_page_id' && eventData.landing_page_id && eventData.landing_page_id !== value) return false;
    if (key === 'cadence_id' && eventData.cadence_id && eventData.cadence_id !== value) return false;
  }
  return true;
}

async function executeAction(db, action, eventData, now) {
  switch (action.type) {
    case 'enroll_cadence': {
      if (!eventData.lead_id || !action.config?.cadence_id) break;
      // Check not already enrolled
      const existing = await db.prepare(
        "SELECT id FROM cadence_enrollments WHERE cadence_id = ? AND lead_id = ? AND status = 'active'"
      ).get(action.config.cadence_id, eventData.lead_id);
      if (existing) break;

      const enrollId = uuidv4();
      // Get first step delay
      const firstStep = await db.prepare(
        'SELECT * FROM cadence_steps WHERE cadence_id = ? AND step_order = 0 AND is_active = 1'
      ).get(action.config.cadence_id);

      const delayMs = firstStep
        ? ((firstStep.delay_days || 0) * 86400000) + ((firstStep.delay_hours || 0) * 3600000)
        : 0;
      const nextAt = new Date(Date.now() + delayMs).toISOString();

      await db.prepare(`
        INSERT INTO cadence_enrollments (id, cadence_id, lead_id, status, current_step, next_step_at, enrolled_by, created_at, updated_at)
        VALUES (?, ?, ?, 'active', 0, ?, ?, ?, ?)
      `).run(enrollId, action.config.cadence_id, eventData.lead_id, nextAt, eventData.user_id || 'system', now, now);

      await db.prepare('UPDATE cadences SET enrolled_count = enrolled_count + 1, updated_at = ? WHERE id = ?')
        .run(now, action.config.cadence_id);
      break;
    }

    case 'change_status': {
      if (!eventData.lead_id || !action.config?.status) break;
      await db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?')
        .run(action.config.status, now, eventData.lead_id);
      await db.prepare(`
        INSERT INTO lead_activities (lead_id, user_id, type, description, created_at)
        VALUES (?, ?, 'status_change', ?, ?)
      `).run(eventData.lead_id, eventData.user_id || 'system', `Status alterado para ${action.config.status} (workflow)`, now);
      break;
    }

    case 'assign_owner': {
      if (!eventData.lead_id || !action.config?.owner_id) break;
      await db.prepare('UPDATE leads SET owner_id = ?, updated_at = ? WHERE id = ?')
        .run(action.config.owner_id, now, eventData.lead_id);
      break;
    }

    case 'add_tag': {
      if (!eventData.lead_id || !action.config?.tag) break;
      const lead = await db.prepare('SELECT tags FROM leads WHERE id = ?').get(eventData.lead_id);
      const tags = JSON.parse(lead?.tags || '[]');
      if (!tags.includes(action.config.tag)) {
        tags.push(action.config.tag);
        await db.prepare('UPDATE leads SET tags = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(tags), now, eventData.lead_id);
      }
      break;
    }

    case 'send_notification': {
      if (!action.config?.user_id || !action.config?.message) break;
      await db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), action.config.user_id, action.config.title || 'Automação', action.config.message, 'sistema', now);
      break;
    }

    default:
      console.warn(`[WorkflowEngine] Unknown action type: ${action.type}`);
  }
}
