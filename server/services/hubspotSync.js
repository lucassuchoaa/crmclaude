import cron from 'node-cron';

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

async function getHubSpotConfig(db) {
  const apiKeyRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('hubspot_api_key');
  const pipelineRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('hubspot_pipeline_id');
  if (!apiKeyRow?.value) return null;
  return { apiKey: apiKeyRow.value, pipelineId: pipelineRow?.value || null };
}

export async function runHubSpotSync(db) {
  const config = await getHubSpotConfig(db);
  if (!config) {
    console.log('[HubSpot Sync] Skipped — API key not configured');
    return { synced: 0, updated: 0, error: null };
  }

  const headers = { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };

  // Fetch indications with hubspot_id that are not in final status
  const finalStatuses = ['aprovado', 'reprovado', 'cancelado'];
  const indications = await db.prepare(
    `SELECT id, hubspot_id, hubspot_status, status, cnpj, razao_social
     FROM indications
     WHERE hubspot_id IS NOT NULL AND status NOT IN (${finalStatuses.map(() => '?').join(',')})`
  ).all(...finalStatuses);

  let synced = 0;
  let updated = 0;

  for (const ind of indications) {
    try {
      // Fetch deal details from HubSpot
      const dealRes = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/deals/${ind.hubspot_id}?properties=dealstage,pipeline,amount,closedate`, {
        headers
      });

      if (!dealRes.ok) {
        console.warn(`[HubSpot Sync] Deal ${ind.hubspot_id} fetch failed (${dealRes.status})`);
        continue;
      }

      const deal = await dealRes.json();
      const stage = deal.properties?.dealstage?.toLowerCase() || '';
      synced++;

      // Update hubspot_status with current stage
      await db.prepare('UPDATE indications SET hubspot_status = ? WHERE id = ?').run(stage, ind.id);

      // If deal is closedwon → move indication to "aprovado"
      if (['closedwon', 'closed_won', 'ganhou'].includes(stage) && ind.status !== 'aprovado') {
        const now = new Date().toISOString();
        await db.prepare('UPDATE indications SET status = ?, updated_at = ? WHERE id = ?').run('aprovado', now, ind.id);

        // Add history entry
        const historyTxt = `Oportunidade marcada como ganha no HubSpot — indicação movida automaticamente para "aprovado".`;
        await db.prepare(
          'INSERT INTO indication_history (indication_id, user_id, action, txt, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(ind.id, null, 'hubspot_sync', historyTxt, now);

        updated++;
        console.log(`[HubSpot Sync] Indication #${ind.id} (${ind.razao_social}) → aprovado (deal closedwon)`);
      }
    } catch (err) {
      console.error(`[HubSpot Sync] Error syncing indication #${ind.id}:`, err.message);
    }
  }

  console.log(`[HubSpot Sync] Completed: ${synced} synced, ${updated} updated to aprovado`);
  return { synced, updated, error: null };
}

export function startHubSpotScheduler(db) {
  // Schedule sync at 8:00, 12:00, 17:00 every day
  cron.schedule('0 8,12,17 * * *', async () => {
    console.log(`[HubSpot Sync] Scheduled run at ${new Date().toISOString()}`);
    try {
      await runHubSpotSync(db);
    } catch (err) {
      console.error('[HubSpot Sync] Scheduled run error:', err.message);
    }
  });

  console.log('[HubSpot Sync] Scheduler started — runs at 08:00, 12:00, 17:00');
}
