import express from 'express';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/summary', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { role, id: userId } = req.user;

    if (!hasPermission(role, 'diretor')) return res.status(403).json({ error: 'Acesso restrito à diretoria.' });

    let gerenteQuery = `
      SELECT g.id, g.name, g.avatar, g.email, g.manager_id,
             d.name as diretor_name, d.id as diretor_id
      FROM users g LEFT JOIN users d ON g.manager_id = d.id
      WHERE g.role = 'gerente' AND g.is_active = 1
    `;
    const params = [];

    if (role === 'diretor') {
      gerenteQuery += ' AND g.manager_id = ?';
      params.push(userId);
    }

    gerenteQuery += ' ORDER BY g.name ASC';

    const gerentes = await db.prepare(gerenteQuery).all(...params);

    const summary = [];
    for (const g of gerentes) {
      const parceiros = await db.prepare(`
        SELECT u.id, u.name, u.empresa, u.avatar,
               COUNT(i.id) as total_indications,
               SUM(CASE WHEN i.status NOT IN ('fechado','perdido') THEN 1 ELSE 0 END) as active_count,
               SUM(CASE WHEN i.status IN ('em_contato','proposta','negociacao') THEN 1 ELSE 0 END) as pipeline_count,
               SUM(CASE WHEN i.status = 'fechado' THEN 1 ELSE 0 END) as closed_count,
               COALESCE(SUM(i.num_funcionarios), 0) as total_funcionarios,
               MAX(i.created_at) as last_indication_date
        FROM users u
        LEFT JOIN indications i ON i.owner_id = u.id
        WHERE u.manager_id = ? AND u.role = 'parceiro' AND u.is_active = 1
        GROUP BY u.id, u.name, u.empresa, u.avatar ORDER BY total_indications DESC
      `).all(g.id);

      // Ensure numeric values (SQLite may return strings for aggregates)
      const num = (v) => Number(v) || 0;

      const totals = parceiros.reduce((acc, p) => ({
        total_indications: acc.total_indications + num(p.total_indications),
        active_count: acc.active_count + num(p.active_count),
        pipeline_count: acc.pipeline_count + num(p.pipeline_count),
        closed_count: acc.closed_count + num(p.closed_count),
        total_funcionarios: acc.total_funcionarios + num(p.total_funcionarios),
      }), { total_indications: 0, active_count: 0, pipeline_count: 0, closed_count: 0, total_funcionarios: 0 });

      const conversion_rate = totals.total_indications > 0
        ? ((totals.closed_count / totals.total_indications) * 100).toFixed(1) : '0.0';

      summary.push({
        gerente: { id: g.id, name: g.name, avatar: g.avatar, email: g.email, diretor_name: g.diretor_name, diretor_id: g.diretor_id },
        parceiro_count: parceiros.length,
        ...totals,
        conversion_rate: parseFloat(conversion_rate),
        parceiros: parceiros.map(p => {
          const ti = num(p.total_indications);
          const cc = num(p.closed_count);
          return {
            ...p,
            total_indications: ti,
            active_count: num(p.active_count),
            pipeline_count: num(p.pipeline_count),
            closed_count: cc,
            total_funcionarios: num(p.total_funcionarios),
            last_indication_date: p.last_indication_date || null,
            conversion_rate: ti > 0 ? parseFloat(((cc / ti) * 100).toFixed(1)) : 0
          };
        })
      });
    }

    if (hasPermission(role, 'executivo')) {
      const byDiretor = {};
      for (const item of summary) {
        const dirKey = item.gerente.diretor_id || 'sem_diretor';
        const dirName = item.gerente.diretor_name || 'Sem Diretor';
        if (!byDiretor[dirKey]) byDiretor[dirKey] = { diretor_id: dirKey, diretor_name: dirName, gerentes: [], total_indications: 0, active_count: 0, pipeline_count: 0, closed_count: 0, total_funcionarios: 0, parceiro_count: 0 };
        byDiretor[dirKey].gerentes.push(item);
        byDiretor[dirKey].total_indications += Number(item.total_indications) || 0;
        byDiretor[dirKey].active_count += Number(item.active_count) || 0;
        byDiretor[dirKey].pipeline_count += Number(item.pipeline_count) || 0;
        byDiretor[dirKey].closed_count += Number(item.closed_count) || 0;
        byDiretor[dirKey].total_funcionarios += Number(item.total_funcionarios) || 0;
        byDiretor[dirKey].parceiro_count += Number(item.parceiro_count) || 0;
      }
      // Calculate conversion rate per director
      for (const dir of Object.values(byDiretor)) {
        dir.conversion_rate = dir.total_indications > 0
          ? parseFloat(((dir.closed_count / dir.total_indications) * 100).toFixed(1)) : 0;
      }
      return res.json({ summary: Object.values(byDiretor), grouped: true });
    }

    res.json({ summary, grouped: false });
  } catch (error) {
    console.error('Diretoria summary error:', error);
    res.status(500).json({ error: 'Erro ao buscar resumo da diretoria.' });
  }
});

export default router;
