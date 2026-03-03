import { getDatabase, initializeDatabase } from '../config/database.js';
import { hashPassword } from '../config/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ─── Frontend demo data (mirrored exactly from App.jsx) ─────────────────────

const ALL_USERS = [
  { id: "sa1", email: "admin@somapay.com.br",      pw: "admin123", name: "Super Admin",      role: "super_admin", av: "SA" },
  { id: "e1",  email: "executivo@somapay.com.br",  pw: "exe123",   name: "Ricardo Executivo", role: "executivo",  av: "RE" },
  { id: "d1",  email: "diretoria@somapay.com.br",  pw: "dir123",   name: "Carlos Diretor",    role: "diretor",    av: "CD", managerId: "e1" },
  { id: "d2",  email: "diretoria2@somapay.com.br", pw: "dir123",   name: "Lucia Diretora",    role: "diretor",    av: "LD", managerId: "e1" },
  { id: "g1",  email: "gerente1@somapay.com.br",   pw: "ger123",   name: "Ana Gerente",       role: "gerente",    av: "AG", managerId: "d1" },
  { id: "g2",  email: "gerente2@somapay.com.br",   pw: "ger123",   name: "Bruno Gerente",     role: "gerente",    av: "BG", managerId: "d1" },
  { id: "g3",  email: "gerente3@somapay.com.br",   pw: "ger123",   name: "Carla Gerente",     role: "gerente",    av: "CG", managerId: "d2" },
  { id: "p1",  email: "parceiro1@email.com",       pw: "par123",   name: "João Parceiro",     role: "parceiro",   av: "JP", managerId: "g1", empresa: "JM Consultoria",  tel: "(85) 99999-1111", comTipo: "pct",   comVal: 1.5 },
  { id: "p2",  email: "parceiro2@email.com",       pw: "par123",   name: "Maria Parceira",    role: "parceiro",   av: "MP", managerId: "g1", empresa: "MP Assessoria",   tel: "(85) 99999-2222", comTipo: "valor", comVal: 4.00 },
  { id: "p3",  email: "parceiro3@email.com",       pw: "par123",   name: "Pedro Parceiro",    role: "parceiro",   av: "PP", managerId: "g2", empresa: "PP Negócios",     tel: "(85) 99999-3333", comTipo: "pct",   comVal: 1.2 },
  { id: "p4",  email: "parceiro4@email.com",       pw: "par123",   name: "Rafaela Parceira",  role: "parceiro",   av: "RP", managerId: "g3", empresa: "RF Digital",      tel: "(85) 99999-4444", comTipo: "valor", comVal: 5.00 },
];

// No demo data - production-ready seed with users only

// ─── Seed function ───────────────────────────────────────────────────────────

export async function seedIfEmpty(db) {
  const existingUsers = await db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existingUsers.count > 0) {
    return;
  }

  console.log('Seeding database with users only (clean database)...');

  for (const u of ALL_USERS) {
    const hashedPassword = await hashPassword(u.pw);

    await db.prepare(`
      INSERT INTO users (id, email, password, name, role, avatar, manager_id, empresa, tel, com_tipo, com_val)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      u.id,
      u.email,
      hashedPassword,
      u.name,
      u.role,
      u.av,
      u.managerId || null,
      u.empresa || null,
      u.tel || null,
      u.comTipo || null,
      u.comVal || null
    );

    console.log(`  Created user: ${u.email} (${u.id})`);
  }

  console.log(`Database seeded: ${ALL_USERS.length} users created.`);
}

// Run standalone if called directly
async function seed() {
  console.log('Initializing database...');
  await initializeDatabase();
  const db = getDatabase();
  await seedIfEmpty(db);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  seed().catch(console.error);
}
