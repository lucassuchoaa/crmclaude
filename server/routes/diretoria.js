import express from 'express';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/diretoria/summary
 * Resumo hierárquico completo para diretores+
 */
router.get('/summary', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { role, id: userId } = req.user;

    if (!hasPermission(role, 'diretor')) {
      return res.status(403).json({ error: 'Acesso restrito à diretoria.' });
    }

    // Busca gerentes (filtrados por hierarquia)
    let gerenteQuery = `
      SELECT g.id, g.name, g.avatar, g.email, g.manager_id,
             d.name as diretor_name, d.id as diretor_id
      FROM users g
      LEFT JOIN users d ON g.manager_id = d.id
      WHERE g.role = 'gerente' AND g.is_active = 1
    `;
    const params = [];

    if (role === 'diretor') {
      gerenteQuery += ' AND g.manager_id = ?';
      params.push(userId);
    }

    gerenteQuery += ' ORDER BY g.name ASC';

    const gerentes = db.prepare(gerenteQuery).all(...params);

    // Para cada gerente, busca parceiros e métricas
    const summary = gerentes.map(g => {
      const parceiros = db.prepare(`
        SELECT u.id, u.name, u.empresa, u.avatar,
               COUNT(i.id) as total_indications,
               SUM(CASE WHEN i.status NOT IN ('fechado','perdido') THEN 1 ELSE 0 END) as active_count,
               SUM(CASE WHEN i.status IN ('em_contato','proposta','negociacao') THEN 1 ELSE 0 END) as pipeline_count,
               SUM(CASE WHEN i.status = 'fechado' THEN 1 ELSE 0 END) as closed_count
        FROM users u
        LEFT JOIN indications i ON i.owner_id = u.id
        WHERE u.manager_id = ? AND u.role = 'parceiro' AND u.is_active = 1
        GROUP BY u.id
        ORDER BY total_indications DESC
      `).all(g.id);

      const totals = parceiros.reduce((acc, p) => ({
        total_indications: acc.total_indications + (p.total_indications || 0),
        active_count: acc.active_count + (p.active_count || 0),
        pipeline_count: acc.pipeline_count + (p.pipeline_count || 0),
        closed_count: acc.closed_count + (p.closed_count || 0),
      }), { total_indications: 0, active_count: 0, pipeline_count: 0, closed_count: 0 });

      const conversion_rate = totals.total_indications > 0
        ? ((totals.closed_count / totals.total_indications) * 100).toFixed(1)
        : '0.0';

      return {
        gerente: { id: g.id, name: g.name, avatar: g.avatar, email: g.email, diretor_name: g.diretor_name, diretor_id: g.diretor_id },
        parceiro_count: parceiros.length,
        ...totals,
        conversion_rate: parseFloat(conversion_rate),
        parceiros: parceiros.map(p => ({
          ...p,
          conversion_rate: p.total_indications > 0
            ? parseFloat(((p.closed_count / p.total_indications) * 100).toFixed(1))
            : 0
        }))
      };
    });

    // Para executivo/super_admin, agrupar por diretor
    if (hasPermission(role, 'executivo')) {
      const byDiretor = {};
      for (const item of summary) {
        const dirKey = item.gerente.diretor_id || 'sem_diretor';
        const dirName = item.gerente.diretor_name || 'Sem Diretor';
        if (!byDiretor[dirKey]) {
          byDiretor[dirKey] = { diretor_id: dirKey, diretor_name: dirName, gerentes: [] };
        }
        byDiretor[dirKey].gerentes.push(item);
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
