import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'crm.db');

let db = null;

export function getDatabase() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initializeDatabase() {
  const db = getDatabase();

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('super_admin', 'executivo', 'diretor', 'gerente', 'parceiro')),
      avatar TEXT,
      manager_id TEXT,
      empresa TEXT,
      tel TEXT,
      com_tipo TEXT CHECK(com_tipo IN ('pct', 'valor') OR com_tipo IS NULL),
      com_val REAL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manager_id) REFERENCES users(id)
    )
  `);

  // Migrate users table: add parceiro fields if they don't exist
  const userColumns = db.pragma('table_info(users)').map(c => c.name);
  if (!userColumns.includes('empresa')) {
    db.exec(`ALTER TABLE users ADD COLUMN empresa TEXT`);
  }
  if (!userColumns.includes('tel')) {
    db.exec(`ALTER TABLE users ADD COLUMN tel TEXT`);
  }
  if (!userColumns.includes('com_tipo')) {
    db.exec(`ALTER TABLE users ADD COLUMN com_tipo TEXT`);
  }
  if (!userColumns.includes('com_val')) {
    db.exec(`ALTER TABLE users ADD COLUMN com_val REAL`);
  }

  // Refresh tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Indications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS indications (
      id TEXT PRIMARY KEY,
      cnpj TEXT NOT NULL,
      razao_social TEXT NOT NULL,
      nome_fantasia TEXT,
      contato_nome TEXT,
      contato_telefone TEXT,
      contato_email TEXT,
      num_funcionarios INTEGER,
      status TEXT DEFAULT 'novo' CHECK(status IN ('novo', 'em_contato', 'proposta', 'negociacao', 'fechado', 'perdido')),
      owner_id TEXT NOT NULL,
      manager_id TEXT,
      hubspot_id TEXT,
      hubspot_status TEXT,
      liberacao_status TEXT,
      liberacao_data TEXT,
      liberacao_expiry TEXT,
      capital REAL,
      abertura TEXT,
      cnae TEXT,
      endereco TEXT,
      value REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id),
      FOREIGN KEY (manager_id) REFERENCES users(id)
    )
  `);

  // Migrate indications table: add new fields if they don't exist
  const indicationColumns = db.pragma('table_info(indications)').map(c => c.name);
  const indicationMigrations = [
    ['num_funcionarios', 'ALTER TABLE indications ADD COLUMN num_funcionarios INTEGER'],
    ['hubspot_id',       'ALTER TABLE indications ADD COLUMN hubspot_id TEXT'],
    ['hubspot_status',   'ALTER TABLE indications ADD COLUMN hubspot_status TEXT'],
    ['liberacao_status', 'ALTER TABLE indications ADD COLUMN liberacao_status TEXT'],
    ['liberacao_data',   'ALTER TABLE indications ADD COLUMN liberacao_data TEXT'],
    ['liberacao_expiry', 'ALTER TABLE indications ADD COLUMN liberacao_expiry TEXT'],
    ['capital',          'ALTER TABLE indications ADD COLUMN capital REAL'],
    ['abertura',         'ALTER TABLE indications ADD COLUMN abertura TEXT'],
    ['cnae',             'ALTER TABLE indications ADD COLUMN cnae TEXT'],
    ['endereco',         'ALTER TABLE indications ADD COLUMN endereco TEXT'],
  ];
  for (const [col, sql] of indicationMigrations) {
    if (!indicationColumns.includes(col)) {
      db.exec(sql);
    }
  }

  // Indication history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS indication_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indication_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      txt TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (indication_id) REFERENCES indications(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Migrate indication_history table: add txt column if it doesn't exist
  const historyColumns = db.pragma('table_info(indication_history)').map(c => c.name);
  if (!historyColumns.includes('txt')) {
    db.exec(`ALTER TABLE indication_history ADD COLUMN txt TEXT`);
  }

  // Commissions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS commissions (
      id TEXT PRIMARY KEY,
      indication_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      percentage REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'paid', 'cancelled')),
      payment_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (indication_id) REFERENCES indications(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // NFEs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS nfes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      number TEXT NOT NULL,
      value REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'paid')),
      file_path TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Materials table
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      file_path TEXT,
      file_type TEXT,
      roles_allowed TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error')),
      is_read INTEGER DEFAULT 0,
      link TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migrate notifications table: add email_sent column
  const notifColumns = db.pragma('table_info(notifications)').map(c => c.name);
  if (!notifColumns.includes('email_sent')) {
    db.exec(`ALTER TABLE notifications ADD COLUMN email_sent INTEGER DEFAULT 0`);
  }

  // Settings table (for HubSpot API keys, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);
    CREATE INDEX IF NOT EXISTS idx_indications_owner ON indications(owner_id);
    CREATE INDEX IF NOT EXISTS idx_indications_status ON indications(status);
    CREATE INDEX IF NOT EXISTS idx_indications_cnpj ON indications(cnpj);
    CREATE INDEX IF NOT EXISTS idx_commissions_user ON commissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
    CREATE INDEX IF NOT EXISTS idx_nfes_user ON nfes(user_id);
    CREATE INDEX IF NOT EXISTS idx_nfes_status ON nfes(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
  `);

  console.log('Database initialized successfully');
  return db;
}

export default { getDatabase, initializeDatabase };
