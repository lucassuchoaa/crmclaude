import cron from 'node-cron';
import { getDatabase } from '../config/database.js';

/**
 * Execute pending cadence steps.
 * Runs every 5 minutes.
 */
async function runCadenceSteps(db) {
  const now = new Date().toISOString();

  // Find enrollments due for next step
  const enrollments = await db.prepare(`
    SELECT ce.*, c.status as cadence_status
    FROM cadence_enrollments ce
    JOIN cadences c ON ce.cadence_id = c.id
    WHERE ce.status = 'active'
      AND c.status = 'active'
      AND ce.next_step_at IS NOT NULL
      AND ce.next_step_at <= ?
  `).all(now);

  let executed = 0;
  let errors = 0;

  for (const enrollment of enrollments) {
    try {
      // Get the next step
      const step = await db.prepare(`
        SELECT * FROM cadence_steps
        WHERE cadence_id = ? AND step_order = ? AND is_active = 1
      `).get(enrollment.cadence_id, enrollment.current_step);

      if (!step) {
        // No more steps — mark completed
        await db.prepare(`
          UPDATE cadence_enrollments SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?
        `).run(now, now, enrollment.id);

        await db.prepare(`
          UPDATE cadences SET completed_count = completed_count + 1, updated_at = ? WHERE id = ?
        `).run(now, enrollment.cadence_id);
        continue;
      }

      // Get lead info
      const lead = await db.prepare('SELECT * FROM leads WHERE id = ?').get(enrollment.lead_id);
      if (!lead) continue;

      let execStatus = 'pending';
      let errorMessage = null;

      if (step.channel === 'email') {
        // Try to send email via Gmail
        const result = await sendCadenceEmail(db, enrollment, step, lead);
        execStatus = result.success ? 'sent' : 'failed';
        errorMessage = result.error || null;
      } else if (step.channel === 'whatsapp') {
        // Try to send WhatsApp via Evolution API
        const result = await sendCadenceWhatsApp(db, enrollment, step, lead);
        execStatus = result.success ? 'sent' : 'failed';
        errorMessage = result.error || null;
      } else if (step.channel === 'call' || step.channel === 'linkedin') {
        // Create a task/notification for the user
        await createTaskNotification(db, enrollment, step, lead);
        execStatus = 'sent';
      } else if (step.channel === 'wait') {
        execStatus = 'sent';
      }

      // Record execution
      await db.prepare(`
        INSERT INTO cadence_executions (enrollment_id, cadence_id, step_id, lead_id, channel, status, sent_at, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(enrollment.id, enrollment.cadence_id, step.id, enrollment.lead_id, step.channel, execStatus, execStatus === 'sent' ? now : null, errorMessage, now);

      // Record lead activity
      await db.prepare(`
        INSERT INTO lead_activities (lead_id, user_id, type, channel, subject, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(enrollment.lead_id, enrollment.enrolled_by, 'cadence_step', step.channel, step.email_subject || `Cadência step ${step.step_order}`, `Step ${step.step_order} executado (${step.channel})`, now);

      // Advance to next step
      const nextStep = await db.prepare(`
        SELECT * FROM cadence_steps
        WHERE cadence_id = ? AND step_order = ? AND is_active = 1
      `).get(enrollment.cadence_id, enrollment.current_step + 1);

      if (nextStep) {
        const delayMs = ((nextStep.delay_days || 0) * 86400000) + ((nextStep.delay_hours || 0) * 3600000);
        const nextAt = new Date(Date.now() + delayMs).toISOString();
        await db.prepare(`
          UPDATE cadence_enrollments SET current_step = ?, next_step_at = ?, updated_at = ? WHERE id = ?
        `).run(enrollment.current_step + 1, nextAt, now, enrollment.id);
      } else {
        // Completed
        await db.prepare(`
          UPDATE cadence_enrollments SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?
        `).run(now, now, enrollment.id);
        await db.prepare(`
          UPDATE cadences SET completed_count = completed_count + 1, updated_at = ? WHERE id = ?
        `).run(now, enrollment.cadence_id);
      }

      // Update lead last_activity_at
      await db.prepare('UPDATE leads SET last_activity_at = ?, updated_at = ? WHERE id = ?').run(now, now, enrollment.lead_id);

      executed++;
    } catch (err) {
      console.error(`[CadenceRunner] Error processing enrollment ${enrollment.id}:`, err.message);
      errors++;
    }
  }

  if (executed > 0 || errors > 0) {
    console.log(`[CadenceRunner] Executed: ${executed}, Errors: ${errors}`);
  }
  return { executed, errors };
}

async function sendCadenceEmail(db, enrollment, step, lead) {
  try {
    // Get user's Google token
    const tokens = await db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(enrollment.enrolled_by);
    if (!tokens) return { success: false, error: 'No Google token configured' };

    // Check token expiry and refresh if needed
    let accessToken = tokens.access_token;
    if (new Date(tokens.token_expiry) < new Date()) {
      const configRow = await db.prepare("SELECT value FROM settings WHERE key = ?").get('google_client_id');
      const secretRow = await db.prepare("SELECT value FROM settings WHERE key = ?").get('google_client_secret');
      if (!configRow?.value || !secretRow?.value) return { success: false, error: 'Google not configured' };

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: configRow.value,
          client_secret: secretRow.value,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const data = await res.json();
      if (!data.access_token) return { success: false, error: 'Token refresh failed' };
      accessToken = data.access_token;
      const expiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
      await db.prepare('UPDATE google_tokens SET access_token = ?, token_expiry = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run(accessToken, expiry, enrollment.enrolled_by);
    }

    if (!lead.email) return { success: false, error: 'Lead has no email' };

    // Replace variables in subject/body
    const subject = replaceVariables(step.email_subject || '', lead);
    const body = replaceVariables(step.email_body || '', lead);

    // Build RFC 2822 message
    const raw = buildRawEmail(tokens.email || '', lead.email, subject, body);

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      return { success: false, error: `Gmail send failed: ${err}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendCadenceWhatsApp(db, enrollment, step, lead) {
  try {
    if (!lead.phone) return { success: false, error: 'Lead has no phone' };

    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

    // Get user's WhatsApp instance
    const instance = await db.prepare('SELECT * FROM whatsapp_instances WHERE gerente_id = ? AND status = ?')
      .get(enrollment.enrolled_by, 'connected');
    if (!instance) return { success: false, error: 'No WhatsApp instance connected' };

    const message = replaceVariables(step.whatsapp_message || '', lead);
    const phone = lead.phone.replace(/\D/g, '');
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance.instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: jid, text: message }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `WhatsApp send failed: ${err}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function createTaskNotification(db, enrollment, step, lead) {
  const { v4: uuidv4 } = await import('uuid');
  const now = new Date().toISOString();
  const channelLabel = step.channel === 'call' ? 'Ligação' : 'LinkedIn';
  const description = step.channel === 'call'
    ? (step.call_script || `Ligar para ${lead.name || lead.company || lead.phone}`)
    : (step.linkedin_message || `Ação LinkedIn para ${lead.name || lead.company}`);

  await db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    enrollment.enrolled_by,
    `📞 Tarefa de cadência: ${channelLabel}`,
    description,
    'sistema',
    now
  );
}

function replaceVariables(template, lead) {
  return template
    .replace(/\{\{nome\}\}/gi, lead.name || '')
    .replace(/\{\{name\}\}/gi, lead.name || '')
    .replace(/\{\{empresa\}\}/gi, lead.company || lead.razao_social || '')
    .replace(/\{\{company\}\}/gi, lead.company || lead.razao_social || '')
    .replace(/\{\{email\}\}/gi, lead.email || '')
    .replace(/\{\{telefone\}\}/gi, lead.phone || '')
    .replace(/\{\{phone\}\}/gi, lead.phone || '')
    .replace(/\{\{cargo\}\}/gi, lead.job_title || '')
    .replace(/\{\{job_title\}\}/gi, lead.job_title || '');
}

function buildRawEmail(from, to, subject, body) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    body,
  ].join('\r\n');

  return Buffer.from(message).toString('base64url');
}

export function startCadenceRunner(db) {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runCadenceSteps(db);
    } catch (err) {
      console.error('[CadenceRunner] Error:', err.message);
    }
  });
  console.log('[CadenceRunner] Scheduled every 5 minutes');
}

export { runCadenceSteps };
