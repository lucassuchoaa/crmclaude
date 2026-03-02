import { hasPermission, ROLE_HIERARCHY } from '../config/auth.js';

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!hasPermission(req.user.role, minRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

export function canAccessResource(_resourceOwnerIdField = 'owner_id') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Super admins and executives can access everything
    if (hasPermission(req.user.role, 'executivo')) {
      return next();
    }

    // For directors and below, they can only access their own resources
    // or resources of users they manage
    req.accessFilter = {
      userId: req.user.id,
      role: req.user.role,
      canAccessAll: hasPermission(req.user.role, 'executivo')
    };

    next();
  };
}

export function checkResourceOwnership(getResourceOwner) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Super admins and executives can modify anything
    if (hasPermission(req.user.role, 'executivo')) {
      return next();
    }

    try {
      const ownerId = await getResourceOwner(req);

      if (!ownerId) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      // Check if user owns the resource or manages the owner
      if (ownerId === req.user.id) {
        return next();
      }

      // Directors and gerentes can manage their team's resources
      if (req.user.role === 'diretor' || req.user.role === 'gerente') {
        const { getDatabase } = await import('../config/database.js');
        const db = getDatabase();
        const owner = db.prepare('SELECT manager_id FROM users WHERE id = ?').get(ownerId);
        if (owner && owner.manager_id === req.user.id) {
          return next();
        }
        // For directors, also check 2 levels deep (gerente's parceiros)
        if (req.user.role === 'diretor') {
          const indirectReport = db.prepare(`
            SELECT id FROM users WHERE id = ? AND manager_id IN (
              SELECT id FROM users WHERE manager_id = ?
            )
          `).get(ownerId, req.user.id);
          if (indirectReport) return next();
        }
      }

      return res.status(403).json({ error: 'Not authorized to access this resource' });
    } catch (_error) {
      return res.status(500).json({ error: 'Error checking resource ownership' });
    }
  };
}

export default {
  requireRole,
  requireMinRole,
  canAccessResource,
  checkResourceOwnership
};
