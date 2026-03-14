import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'crm.db');

let db = null;

// ── SQL conversion helpers ──────────────────────────────────────────────────

/**
 * Convert SQLite-flavored SQL to PostgreSQL on the fly.
 * When running on SQLite the original SQL is returned untouched.
 */
function convertSql(sql, dbType) {
  if (dbType === 'sqlite') return sql;

  let s = sql;

  // Positional params: ? → $1, $2, …
  let idx = 0;
  s = s.replace(/\?/g, () => `$${++idx}`);

  // INSERT OR IGNORE → INSERT … ON CONFLICT DO NOTHING
  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  if (/INSERT\s+INTO/i.test(sql) && /OR\s+IGNORE/i.test(sql)) {
    s = s.replace(/(VALUES\s*\([^)]+\))/i, '$1 ON CONFLICT DO NOTHING');
  }

  // datetime('now', '+N minutes') → NOW() + INTERVAL 'N minutes'
  s = s.replace(/datetime\(\s*'now'\s*,\s*'([^']+)'\s*\)/gi, (_m, interval) => {
    return `NOW() + INTERVAL '${interval}'`;
  });

  // datetime('now') → NOW()
  s = s.replace(/datetime\(\s*'now'\s*\)/gi, 'NOW()');

  // CURRENT_TIMESTAMP stays the same in PG (it works)

  // LIKE → ILIKE (PG LIKE is case-sensitive, SQLite is case-insensitive)
  s = s.replace(/\bLIKE\b/g, 'ILIKE');

  return s;
}

/**
 * Convert DDL statements for PostgreSQL.
 */
function adaptDDL(sql) {
  let s = sql;

  // INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
  s = s.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');

  // Remove SQLite-specific CHECK constraint syntax that PG handles differently
  // Keep CHECK constraints as-is — PG supports them

  // BOOLEAN: SQLite uses INTEGER, PG uses BOOLEAN but INTEGER works too
  // Keep as-is for compatibility

  // datetime('now', …) in DEFAULT — use PG syntax
  s = s.replace(/DEFAULT\s+datetime\(\s*'now'\s*,\s*'([^']+)'\s*\)/gi, (_m, interval) => {
    return `DEFAULT (NOW() + INTERVAL '${interval}')`;
  });

  // Remove IF NOT EXISTS from CREATE INDEX for PostgreSQL compatibility
  // Actually PG supports IF NOT EXISTS on indexes since 9.5, so keep it

  return s;
}

// ── SQLite Adapter ──────────────────────────────────────────────────────────

async function createSqliteAdapter() {
  const Database = (await import('better-sqlite3')).default;
  const raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  return {
    type: 'sqlite',
    raw,

    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        get(...params) { return stmt.get(...params); },
        all(...params) { return stmt.all(...params); },
        run(...params) { return stmt.run(...params); },
      };
    },

    exec(sql) {
      return raw.exec(sql);
    },

    pragma(p) {
      return raw.pragma(p);
    },
  };
}

// ── PostgreSQL Adapter ──────────────────────────────────────────────────────

function createPgAdapter(pool) {
  return {
    type: 'pg',
    raw: pool,

    prepare(sql) {
      const converted = convertSql(sql, 'pg');
      return {
        async get(...params) {
          const { rows } = await pool.query(converted, params);
          return rows[0] || null;
        },
        async all(...params) {
          const { rows } = await pool.query(converted, params);
          return rows;
        },
        async run(...params) {
          const result = await pool.query(converted, params);
          return { changes: result.rowCount };
        },
      };
    },

    async exec(sql) {
      // exec can receive multiple statements separated by ;
      // PG pool.query handles multi-statement as a single call
      await pool.query(sql);
    },

    // No-op for PG (pragma is SQLite-specific)
    pragma() { return []; },
  };
}

// ── Initialization ──────────────────────────────────────────────────────────

export async function initializeDatabase() {
  if (db) return db;

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    // ── PostgreSQL ──
    const pg = await import('pg');
    const Pool = pg.default?.Pool || pg.Pool;

    // Remove sslmode from connection string to prevent pg from overriding our ssl config
    let cleanUrl = databaseUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
    const needsSsl = databaseUrl.includes('sslmode=require') || databaseUrl.includes('sslmode=verify') || process.env.NODE_ENV === 'production';

    const pool = new Pool({
      connectionString: cleanUrl,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
    });

    // Test connection
    const client = await pool.connect();
    client.release();
    console.log('Connected to PostgreSQL');

    db = createPgAdapter(pool);
  } else {
    // ── SQLite ──
    const fs = await import('fs');
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = await createSqliteAdapter();
    console.log('Connected to SQLite');
  }

  // ── Create tables ──
  await createTables(db);

  console.log('Database initialized successfully');
  return db;
}

export function getDatabase() {
  if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return db;
}

// ── Table creation ──────────────────────────────────────────────────────────

async function createTables(db) {
  const isPg = db.type === 'pg';

  // Helper: run DDL adapted for the current driver
  async function ddl(sql) {
    const adapted = isPg ? adaptDDL(sql) : sql;
    await db.exec(adapted);
  }

  // Users table
  await ddl(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar TEXT,
      manager_id TEXT,
      empresa TEXT,
      tel TEXT,
      cnpj TEXT,
      com_tipo TEXT,
      com_val REAL,
      must_change_password INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Refresh tokens table
  const refreshTokensDDL = isPg
    ? `CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`;
  await db.exec(refreshTokensDDL);

  // Indications table
  await ddl(`
    CREATE TABLE IF NOT EXISTS indications (
      id TEXT PRIMARY KEY,
      cnpj TEXT NOT NULL,
      razao_social TEXT NOT NULL,
      nome_fantasia TEXT,
      contato_nome TEXT,
      contato_telefone TEXT,
      contato_email TEXT,
      num_funcionarios INTEGER,
      status TEXT DEFAULT 'novo',
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
      hubspot_analysis TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Indication history table
  const indicationHistoryDDL = isPg
    ? `CREATE TABLE IF NOT EXISTS indication_history (
        id SERIAL PRIMARY KEY,
        indication_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        txt TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS indication_history (
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
      )`;
  await db.exec(indicationHistoryDDL);

  // Commissions table
  await ddl(`
    CREATE TABLE IF NOT EXISTS commissions (
      id TEXT PRIMARY KEY,
      indication_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      percentage REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // NFEs table
  await ddl(`
    CREATE TABLE IF NOT EXISTS nfes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      number TEXT NOT NULL,
      value REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      file_path TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Materials table
  await ddl(`
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
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Notifications table
  await ddl(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      email_sent INTEGER DEFAULT 0,
      link TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Messages table
  await ddl(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      group_gerente_id TEXT NOT NULL,
      group_parceiro_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_type TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      metadata TEXT,
      is_read INTEGER DEFAULT 0,
      source TEXT DEFAULT 'crm',
      whatsapp_message_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // WhatsApp instances table
  await ddl(`
    CREATE TABLE IF NOT EXISTS whatsapp_instances (
      id TEXT PRIMARY KEY,
      gerente_id TEXT UNIQUE NOT NULL,
      instance_name TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'disconnected',
      qr_code TEXT,
      qr_expires_at TEXT,
      connected_phone TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Convenios table
  await ddl(`
    CREATE TABLE IF NOT EXISTS convenios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Parceiro-Convenio junction table
  await ddl(`
    CREATE TABLE IF NOT EXISTS parceiro_convenios (
      parceiro_id TEXT NOT NULL,
      convenio_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (parceiro_id, convenio_id)
    )
  `);

  // User-Convenio junction table
  await ddl(`
    CREATE TABLE IF NOT EXISTS user_convenios (
      user_id TEXT NOT NULL,
      convenio_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, convenio_id)
    )
  `);

  // Settings table
  await ddl(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pipelines table
  await ddl(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pipeline stages table
  await ddl(`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      display_order INTEGER DEFAULT 0,
      is_win INTEGER DEFAULT 0,
      is_lost INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Deals table
  await ddl(`
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT,
      value REAL DEFAULT 0,
      owner_id TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      contact_name TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Deal activities table
  const dealActivitiesDDL = isPg
    ? `CREATE TABLE IF NOT EXISTS deal_activities (
        id SERIAL PRIMARY KEY,
        deal_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'note',
        description TEXT,
        scheduled_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS deal_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'note',
        description TEXT,
        scheduled_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
      )`;
  await db.exec(dealActivitiesDDL);

  // Deal tasks table
  const dealTasksDDL = isPg
    ? `CREATE TABLE IF NOT EXISTS deal_tasks (
        id SERIAL PRIMARY KEY,
        deal_id TEXT NOT NULL,
        assigned_to TEXT NOT NULL,
        title TEXT NOT NULL,
        due_date TEXT,
        is_completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS deal_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id TEXT NOT NULL,
        assigned_to TEXT NOT NULL,
        title TEXT NOT NULL,
        due_date TEXT,
        is_completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
      )`;
  await db.exec(dealTasksDDL);

  // ── Indexes ──
  // PG and SQLite both support CREATE INDEX IF NOT EXISTS
  const indexes = `
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
    CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_gerente_id, group_parceiro_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_gerente ON whatsapp_instances(gerente_id);
    CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON messages(whatsapp_message_id);
    CREATE INDEX IF NOT EXISTS idx_users_tel ON users(tel);
    CREATE INDEX IF NOT EXISTS idx_convenios_active ON convenios(is_active);
    CREATE INDEX IF NOT EXISTS idx_parceiro_convenios_parceiro ON parceiro_convenios(parceiro_id);
    CREATE INDEX IF NOT EXISTS idx_parceiro_convenios_convenio ON parceiro_convenios(convenio_id);
    CREATE INDEX IF NOT EXISTS idx_user_convenios_user ON user_convenios(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_convenios_convenio ON user_convenios(convenio_id);
    CREATE INDEX IF NOT EXISTS idx_pipelines_created_by ON pipelines(created_by);
    CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);
    CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);
    CREATE INDEX IF NOT EXISTS idx_deal_activities_deal ON deal_activities(deal_id);
    CREATE INDEX IF NOT EXISTS idx_deal_tasks_deal ON deal_tasks(deal_id);
    CREATE INDEX IF NOT EXISTS idx_deal_tasks_assigned ON deal_tasks(assigned_to);
  `;

  if (isPg) {
    // PG: execute each CREATE INDEX individually (multi-statement with ; can fail)
    for (const line of indexes.split(';')) {
      const trimmed = line.trim();
      if (trimmed) await db.exec(trimmed);
    }
  } else {
    await db.exec(indexes);
  }

  // ── PostgreSQL migrations ──
  if (isPg) {
    const pgSafeAddColumn = async (table, column, definition) => {
      try {
        await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
      } catch { /* column already exists */ }
    };

    await pgSafeAddColumn('indications', 'hubspot_analysis', 'TEXT');
    await pgSafeAddColumn('users', 'last_login_at', 'TEXT');
    await pgSafeAddColumn('materials', 'file_data', 'BYTEA');
    await pgSafeAddColumn('materials', 'file_original_name', 'TEXT');
  }

  // ── SQLite-only migrations ──
  if (!isPg) {
    // Add columns that may not exist in older SQLite databases
    const safeAddColumn = async (table, column, definition) => {
      try {
        const cols = db.pragma(`table_info(${table})`).map(c => c.name);
        if (!cols.includes(column)) {
          await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
      } catch { /* column already exists */ }
    };

    await safeAddColumn('users', 'empresa', 'TEXT');
    await safeAddColumn('users', 'tel', 'TEXT');
    await safeAddColumn('users', 'com_tipo', 'TEXT');
    await safeAddColumn('users', 'com_val', 'REAL');
    await safeAddColumn('users', 'cnpj', 'TEXT');
    await safeAddColumn('users', 'must_change_password', 'INTEGER DEFAULT 0');
    await safeAddColumn('indication_history', 'txt', 'TEXT');
    await safeAddColumn('notifications', 'email_sent', 'INTEGER DEFAULT 0');
    await safeAddColumn('messages', 'source', "TEXT DEFAULT 'crm'");
    await safeAddColumn('messages', 'whatsapp_message_id', 'TEXT');
    await safeAddColumn('indications', 'hubspot_analysis', 'TEXT');
    await safeAddColumn('users', 'last_login_at', 'TEXT');
    await safeAddColumn('materials', 'file_data', 'BLOB');
    await safeAddColumn('materials', 'file_original_name', 'TEXT');
  }
}

export default { getDatabase, initializeDatabase };
