import { getDatabase } from '../config/database.js';

/**
 * Calculate lead score based on scoring rules
 */
export async function calculateScore(leadId) {
  const db = getDatabase();
  const lead = await db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  if (!lead) return null;

  const rules = await db.prepare('SELECT * FROM lead_scoring_rules WHERE is_active = 1').all();

  let profileScore = 0;
  let behaviorScore = 0;

  for (const rule of rules) {
    if (rule.type === 'profile') {
      const fieldValue = lead[rule.field] || '';
      if (matchesRule(fieldValue, rule.operator, rule.value)) {
        profileScore += Number(rule.score);
      }
    } else if (rule.type === 'behavior') {
      // Count activities by type
      const count = await db.prepare(
        'SELECT COUNT(*) as cnt FROM lead_activities WHERE lead_id = ? AND type = ?'
      ).get(leadId, rule.field);
      const c = Number(count?.cnt || 0);
      if (matchesRule(c, rule.operator, rule.value)) {
        behaviorScore += Number(rule.score);
      }
    }
  }

  const totalScore = profileScore + behaviorScore;
  const temperature = totalScore >= 70 ? 'hot' : totalScore >= 30 ? 'warm' : 'cold';

  await db.prepare(
    'UPDATE leads SET profile_score = ?, behavior_score = ?, total_score = ?, temperature = ?, updated_at = ? WHERE id = ?'
  ).run(profileScore, behaviorScore, totalScore, temperature, new Date().toISOString(), leadId);

  return { profileScore, behaviorScore, totalScore, temperature };
}

function matchesRule(fieldValue, operator, ruleValue) {
  const fv = String(fieldValue || '').toLowerCase();
  const rv = String(ruleValue || '').toLowerCase();

  switch (operator) {
    case 'equals': return fv === rv;
    case 'contains': return fv.includes(rv);
    case 'greater_than': return Number(fieldValue) > Number(ruleValue);
    case 'less_than': return Number(fieldValue) < Number(ruleValue);
    case 'exists': return !!fieldValue && fieldValue !== '' && fieldValue !== 'null';
    default: return false;
  }
}

/**
 * Recalculate scores for all active leads
 */
export async function recalculateAllScores() {
  const db = getDatabase();
  const leads = await db.prepare("SELECT id FROM leads WHERE status NOT IN ('converted', 'lost')").all();
  let updated = 0;
  for (const lead of leads) {
    await calculateScore(lead.id);
    updated++;
  }
  return { updated };
}
