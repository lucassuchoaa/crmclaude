import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';
import { hasPermission } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole, requireMinRole } from '../middleware/rbac.js';

const router = express.Router();

// GET / - List convenios
// super_admin sees all; convenio role sees only their linked ones
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDatabase();

    if (hasPermission(req.user.role, 'executivo')) {
      // Admin/executivo: all convenios
      const convenios = await db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM parceiro_convenios pc WHERE pc.convenio_id = c.id) as parceiro_count
        FROM convenios c
        ORDER BY c.name
      `).all();
      return res.json({ convenios });
    }

    if (req.user.role === 'convenio') {
      // Convenio role: only their linked convenios
      const convenios = await db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM parceiro_convenios pc WHERE pc.convenio_id = c.id) as parceiro_count
        FROM convenios c
        INNER JOIN user_convenios uc ON uc.convenio_id = c.id
        WHERE uc.user_id = ?
        ORDER BY c.name
      `).all(req.user.id);
      return res.json({ convenios });
    }

    // Gerentes/diretores can see all active convenios (for parceiro assignment)
    if (hasPermission(req.user.role, 'gerente')) {
      const convenios = await db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM parceiro_convenios pc WHERE pc.convenio_id = c.id) as parceiro_count
        FROM convenios c
        WHERE c.is_active = 1
        ORDER BY c.name
      `).all();
      return res.json({ convenios });
    }

    return res.status(403).json({ error: 'Access denied' });
  } catch (error) {
    console.error('Get convenios error:', error);
    res.status(500).json({ error: 'Failed to get convenios' });
  }
});

// POST / - Create convenio (super_admin only)
router.post('/', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const db = getDatabase();
    const id = uuidv4();

    await db.prepare(`
      INSERT INTO convenios (id, name, description) VALUES (?, ?, ?)
    `).run(id, name.trim(), description || null);

    const convenio = await db.prepare('SELECT * FROM convenios WHERE id = ?').get(id);
    res.status(201).json({ convenio: { ...convenio, parceiro_count: 0 } });
  } catch (error) {
    console.error('Create convenio error:', error);
    res.status(500).json({ error: 'Failed to create convenio' });
  }
});

// PUT /:id - Update convenio (super_admin only)
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const { name, description, is_active } = req.body;
    const db = getDatabase();

    const existing = await db.prepare('SELECT * FROM convenios WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Convenio not found' });
    }

    await db.prepare(`
      UPDATE convenios SET name = ?, description = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      description !== undefined ? description : existing.description,
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      new Date().toISOString(),
      req.params.id
    );

    const convenio = await db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM parceiro_convenios pc WHERE pc.convenio_id = c.id) as parceiro_count
      FROM convenios c WHERE c.id = ?
    `).get(req.params.id);

    res.json({ convenio });
  } catch (error) {
    console.error('Update convenio error:', error);
    res.status(500).json({ error: 'Failed to update convenio' });
  }
});

// DELETE /:id - Deactivate convenio (super_admin only)
router.delete('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const db = getDatabase();
    const existing = await db.prepare('SELECT * FROM convenios WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Convenio not found' });
    }

    await db.prepare('UPDATE convenios SET is_active = 0, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), req.params.id);

    res.json({ message: 'Convenio deactivated' });
  } catch (error) {
    console.error('Delete convenio error:', error);
    res.status(500).json({ error: 'Failed to delete convenio' });
  }
});

// GET /:id/parceiros - Parceiros linked to a convenio
router.get('/:id/parceiros', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const convenioId = req.params.id;

    // Check access
    if (req.user.role === 'convenio') {
      const link = await db.prepare('SELECT 1 FROM user_convenios WHERE user_id = ? AND convenio_id = ?')
        .get(req.user.id, convenioId);
      if (!link) return res.status(403).json({ error: 'Access denied' });
    } else if (!hasPermission(req.user.role, 'gerente')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const parceiros = await db.prepare(`
      SELECT u.id, u.name, u.email, u.empresa, u.cnpj, u.tel, u.is_active, u.created_at,
        (SELECT COUNT(*) FROM indications i WHERE i.owner_id = u.id) as indication_count,
        (SELECT COUNT(*) FROM indications i WHERE i.owner_id = u.id AND i.status NOT IN ('perdido', 'fechado')) as active_indications
      FROM users u
      INNER JOIN parceiro_convenios pc ON pc.parceiro_id = u.id
      WHERE pc.convenio_id = ?
      ORDER BY u.name
    `).all(convenioId);

    res.json({ parceiros });
  } catch (error) {
    console.error('Get convenio parceiros error:', error);
    res.status(500).json({ error: 'Failed to get parceiros' });
  }
});

// GET /:id/indications - Indications from parceiros of a convenio
router.get('/:id/indications', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const convenioId = req.params.id;

    // Check access
    if (req.user.role === 'convenio') {
      const link = await db.prepare('SELECT 1 FROM user_convenios WHERE user_id = ? AND convenio_id = ?')
        .get(req.user.id, convenioId);
      if (!link) return res.status(403).json({ error: 'Access denied' });
    } else if (!hasPermission(req.user.role, 'gerente')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const indications = await db.prepare(`
      SELECT i.id, i.cnpj, i.razao_social, i.nome_fantasia, i.status, i.value,
             i.created_at, i.updated_at, u.name as owner_name
      FROM indications i
      INNER JOIN parceiro_convenios pc ON pc.parceiro_id = i.owner_id
      INNER JOIN users u ON u.id = i.owner_id
      WHERE pc.convenio_id = ?
      ORDER BY i.created_at DESC
    `).all(convenioId);

    res.json({ indications });
  } catch (error) {
    console.error('Get convenio indications error:', error);
    res.status(500).json({ error: 'Failed to get indications' });
  }
});

// GET /:id/stats - Stats for a convenio
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const convenioId = req.params.id;

    // Check access
    if (req.user.role === 'convenio') {
      const link = await db.prepare('SELECT 1 FROM user_convenios WHERE user_id = ? AND convenio_id = ?')
        .get(req.user.id, convenioId);
      if (!link) return res.status(403).json({ error: 'Access denied' });
    } else if (!hasPermission(req.user.role, 'gerente')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const totalParceirosRow = await db.prepare(`
      SELECT COUNT(*) as count FROM parceiro_convenios WHERE convenio_id = ?
    `).get(convenioId);
    const totalParceiros = totalParceirosRow.count;

    const totalIndicationsRow = await db.prepare(`
      SELECT COUNT(*) as count FROM indications i
      INNER JOIN parceiro_convenios pc ON pc.parceiro_id = i.owner_id
      WHERE pc.convenio_id = ?
    `).get(convenioId);
    const totalIndications = totalIndicationsRow.count;

    const activeIndicationsRow = await db.prepare(`
      SELECT COUNT(*) as count FROM indications i
      INNER JOIN parceiro_convenios pc ON pc.parceiro_id = i.owner_id
      WHERE pc.convenio_id = ? AND i.status NOT IN ('perdido', 'fechado')
    `).get(convenioId);
    const activeIndications = activeIndicationsRow.count;

    const closedIndicationsRow = await db.prepare(`
      SELECT COUNT(*) as count FROM indications i
      INNER JOIN parceiro_convenios pc ON pc.parceiro_id = i.owner_id
      WHERE pc.convenio_id = ? AND i.status = 'fechado'
    `).get(convenioId);
    const closedIndications = closedIndicationsRow.count;

    const conversionRate = totalIndications > 0
      ? Math.round((closedIndications / totalIndications) * 100)
      : 0;

    const statusDistribution = await db.prepare(`
      SELECT i.status, COUNT(*) as count FROM indications i
      INNER JOIN parceiro_convenios pc ON pc.parceiro_id = i.owner_id
      WHERE pc.convenio_id = ?
      GROUP BY i.status
    `).all(convenioId);

    res.json({
      stats: {
        totalParceiros,
        totalIndications,
        activeIndications,
        closedIndications,
        conversionRate,
        statusDistribution
      }
    });
  } catch (error) {
    console.error('Get convenio stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// POST /:id/parceiros - Link parceiro to convenio
router.post('/:id/parceiros', authenticate, requireMinRole('gerente'), async (req, res) => {
  try {
    const { parceiro_id } = req.body;
    if (!parceiro_id) {
      return res.status(400).json({ error: 'parceiro_id is required' });
    }

    const db = getDatabase();

    // Verify convenio exists
    const convenio = await db.prepare('SELECT id FROM convenios WHERE id = ?').get(req.params.id);
    if (!convenio) return res.status(404).json({ error: 'Convenio not found' });

    // Verify user is a parceiro
    const parceiro = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(parceiro_id);
    if (!parceiro || parceiro.role !== 'parceiro') {
      return res.status(400).json({ error: 'User is not a parceiro' });
    }

    // Check if already linked
    const existing = await db.prepare('SELECT 1 FROM parceiro_convenios WHERE parceiro_id = ? AND convenio_id = ?')
      .get(parceiro_id, req.params.id);
    if (existing) {
      return res.status(409).json({ error: 'Parceiro already linked to this convenio' });
    }

    await db.prepare('INSERT INTO parceiro_convenios (parceiro_id, convenio_id) VALUES (?, ?)')
      .run(parceiro_id, req.params.id);

    res.status(201).json({ message: 'Parceiro linked successfully' });
  } catch (error) {
    console.error('Link parceiro error:', error);
    res.status(500).json({ error: 'Failed to link parceiro' });
  }
});

// DELETE /:id/parceiros/:pid - Unlink parceiro from convenio
router.delete('/:id/parceiros/:pid', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.prepare('DELETE FROM parceiro_convenios WHERE parceiro_id = ? AND convenio_id = ?')
      .run(req.params.pid, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Link not found' });
    }

    res.json({ message: 'Parceiro unlinked successfully' });
  } catch (error) {
    console.error('Unlink parceiro error:', error);
    res.status(500).json({ error: 'Failed to unlink parceiro' });
  }
});

// GET /parceiro/:pid/convenios - Get convenios for a specific parceiro
router.get('/parceiro/:pid/convenios', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const convenios = await db.prepare(`
      SELECT c.id, c.name FROM convenios c
      INNER JOIN parceiro_convenios pc ON pc.convenio_id = c.id
      WHERE pc.parceiro_id = ?
      ORDER BY c.name
    `).all(req.params.pid);

    res.json({ convenios });
  } catch (error) {
    console.error('Get parceiro convenios error:', error);
    res.status(500).json({ error: 'Failed to get convenios' });
  }
});

export default router;
