import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

const IS_TEST = process.env.NODE_ENV === 'test';

if (!process.env.JWT_SECRET || !process.env.REFRESH_SECRET) {
  if (IS_TEST) {
    // Tests get ephemeral per-process secrets — never reused across runs, never known outside
  } else {
    console.error('FATAL: JWT_SECRET and REFRESH_SECRET must be set in environment variables');
    process.exit(1);
  }
}

export const JWT_SECRET =
  process.env.JWT_SECRET || (IS_TEST ? crypto.randomBytes(64).toString('hex') : '');
export const REFRESH_SECRET =
  process.env.REFRESH_SECRET || (IS_TEST ? crypto.randomBytes(64).toString('hex') : '');

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

export function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_error) {
    return null;
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch (_error) {
    return null;
  }
}

export const ROLE_HIERARCHY = {
  super_admin: 6,
  executivo: 5,
  diretor: 4,
  gerente: 3,
  financeiro: 2,
  convenio: 2,
  parceiro: 1
};

export function canViewAllFinancial(role) {
  return ['super_admin', 'executivo', 'diretor', 'financeiro'].includes(role);
}

export function hasPermission(userRole, requiredRole) {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function canManageUser(managerRole, targetRole) {
  if (managerRole === 'super_admin') return true;
  return ROLE_HIERARCHY[managerRole] > ROLE_HIERARCHY[targetRole];
}

export default {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hasPermission,
  canManageUser,
  canViewAllFinancial,
  ROLE_HIERARCHY
};
