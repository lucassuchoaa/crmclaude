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

  // Teams table
  await ddl(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      modules TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Team members junction table
  await ddl(`
    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (team_id, user_id)
    )
  `);

  // Pipelines table
  await ddl(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      team_id TEXT,
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
      num_employees INTEGER,
      product_id TEXT,
      owner_id TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      contact_name TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      notes TEXT,
      loss_reason TEXT,
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

  // Deal contacts (multiple contacts per deal)
  await ddl(`
    CREATE TABLE IF NOT EXISTS deal_contacts (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      role TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pipeline automations
  await ddl(`
    CREATE TABLE IF NOT EXISTS pipeline_automations (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL,
      trigger_stage_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_pipeline_id TEXT,
      target_stage_id TEXT,
      copy_history INTEGER DEFAULT 0,
      auto_tasks TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products
    await ddl(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

  // App-level settings (key-value)
  await ddl(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

  // Google OAuth tokens per user
  await ddl(`
      CREATE TABLE IF NOT EXISTS google_tokens (
        user_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        token_expiry TEXT,
        email TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

  // Proposal templates table
  await ddl(`
    CREATE TABLE IF NOT EXISTS proposal_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      file_path TEXT,
      file_data ${isPg ? 'BYTEA' : 'BLOB'},
      file_original_name TEXT,
      file_type TEXT,
      editable_fields TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Generated proposals table
  await ddl(`
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      title TEXT NOT NULL,
      field_values TEXT DEFAULT '{}',
      status TEXT DEFAULT 'rascunho',
      sent_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Contract templates table
  await ddl(`
    CREATE TABLE IF NOT EXISTS contract_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      file_path TEXT,
      file_data ${isPg ? 'BYTEA' : 'BLOB'},
      file_original_name TEXT,
      file_type TEXT,
      editable_fields TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Generated contracts table
  await ddl(`
    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      title TEXT NOT NULL,
      field_values TEXT DEFAULT '{}',
      status TEXT DEFAULT 'rascunho',
      clicksign_document_key TEXT,
      clicksign_request_signature_key TEXT,
      clicksign_status TEXT,
      clicksign_url TEXT,
      signers TEXT DEFAULT '[]',
      sent_at TEXT,
      signed_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ClickSign config table
  await ddl(`
    CREATE TABLE IF NOT EXISTS clicksign_config (
      id INTEGER PRIMARY KEY ${isPg ? '' : 'AUTOINCREMENT'},
      api_key TEXT NOT NULL,
      environment TEXT DEFAULT 'sandbox',
      updated_by TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Role permissions table (custom access control)
  await ddl(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY ${isPg ? '' : 'AUTOINCREMENT'},
      role TEXT NOT NULL UNIQUE,
      pages TEXT DEFAULT '[]',
      features TEXT DEFAULT '[]',
      updated_by TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ══════════════════════════════════════════════
  // PROSPECTING MODULE TABLES
  // ══════════════════════════════════════════════

  // Leads (central prospecting entity)
  await ddl(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      email TEXT, phone TEXT, name TEXT, company TEXT, cnpj TEXT,
      job_title TEXT, linkedin_url TEXT, website TEXT,
      source TEXT DEFAULT 'manual',
      source_id TEXT,
      owner_id TEXT,
      status TEXT DEFAULT 'new',
      profile_score INTEGER DEFAULT 0,
      behavior_score INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      temperature TEXT DEFAULT 'cold',
      tags TEXT DEFAULT '[]',
      custom_fields TEXT DEFAULT '{}',
      razao_social TEXT, nome_fantasia TEXT, capital REAL,
      abertura TEXT, cnae TEXT, endereco TEXT, num_funcionarios INTEGER,
      uf TEXT, municipio TEXT,
      converted_deal_id TEXT, converted_at TEXT, lost_reason TEXT,
      last_activity_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Lead activities
  const leadActivitiesDDL = isPg
    ? `CREATE TABLE IF NOT EXISTS lead_activities (
        id SERIAL PRIMARY KEY,
        lead_id TEXT NOT NULL,
        user_id TEXT,
        type TEXT NOT NULL,
        channel TEXT, subject TEXT, description TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS lead_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id TEXT NOT NULL,
        user_id TEXT,
        type TEXT NOT NULL,
        channel TEXT, subject TEXT, description TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
      )`;
  await db.exec(leadActivitiesDDL);

  // Lead scoring rules
  await ddl(`
    CREATE TABLE IF NOT EXISTS lead_scoring_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      field TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Lead segments
  await ddl(`
    CREATE TABLE IF NOT EXISTS lead_segments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL, description TEXT,
      filters TEXT NOT NULL DEFAULT '[]',
      match_type TEXT DEFAULT 'all',
      is_dynamic INTEGER DEFAULT 1,
      lead_count INTEGER DEFAULT 0,
      owner_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Cadences
  await ddl(`
    CREATE TABLE IF NOT EXISTS cadences (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL, description TEXT,
      status TEXT DEFAULT 'draft',
      type TEXT DEFAULT 'outbound',
      total_steps INTEGER DEFAULT 0,
      owner_id TEXT NOT NULL, team_id TEXT,
      enrolled_count INTEGER DEFAULT 0,
      completed_count INTEGER DEFAULT 0,
      replied_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Cadence steps
  const cadenceStepsDDL = isPg
    ? `CREATE TABLE IF NOT EXISTS cadence_steps (
        id SERIAL PRIMARY KEY,
        cadence_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        channel TEXT NOT NULL,
        delay_days INTEGER DEFAULT 0,
        delay_hours INTEGER DEFAULT 0,
        email_subject TEXT, email_body TEXT,
        whatsapp_message TEXT,
        call_script TEXT,
        linkedin_action TEXT, linkedin_message TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS cadence_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cadence_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        channel TEXT NOT NULL,
        delay_days INTEGER DEFAULT 0,
        delay_hours INTEGER DEFAULT 0,
        email_subject TEXT, email_body TEXT,
        whatsapp_message TEXT,
        call_script TEXT,
        linkedin_action TEXT, linkedin_message TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cadence_id) REFERENCES cadences(id) ON DELETE CASCADE
      )`;
  await db.exec(cadenceStepsDDL);

  // Cadence enrollments
  await ddl(`
    CREATE TABLE IF NOT EXISTS cadence_enrollments (
      id TEXT PRIMARY KEY,
      cadence_id TEXT NOT NULL, lead_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      current_step INTEGER DEFAULT 0,
      next_step_at TEXT,
      enrolled_by TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Cadence executions
  const cadenceExecDDL = isPg
    ? `CREATE TABLE IF NOT EXISTS cadence_executions (
        id SERIAL PRIMARY KEY,
        enrollment_id TEXT NOT NULL, cadence_id TEXT NOT NULL,
        step_id INTEGER NOT NULL, lead_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        sent_at TEXT, opened_at TEXT, clicked_at TEXT, replied_at TEXT,
        error_message TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS cadence_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enrollment_id TEXT NOT NULL, cadence_id TEXT NOT NULL,
        step_id INTEGER NOT NULL, lead_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        sent_at TEXT, opened_at TEXT, clicked_at TEXT, replied_at TEXT,
        error_message TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (enrollment_id) REFERENCES cadence_enrollments(id) ON DELETE CASCADE
      )`;
  await db.exec(cadenceExecDDL);

  // Landing pages
  await ddl(`
    CREATE TABLE IF NOT EXISTS landing_pages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'draft',
      template_type TEXT DEFAULT 'blank',
      html_content TEXT, css_content TEXT,
      form_fields TEXT DEFAULT '[]',
      thank_you_message TEXT, redirect_url TEXT,
      custom_domain TEXT,
      meta_title TEXT, meta_description TEXT, og_image TEXT,
      variant TEXT DEFAULT 'A', parent_id TEXT,
      views INTEGER DEFAULT 0, submissions INTEGER DEFAULT 0,
      conversion_rate REAL DEFAULT 0,
      owner_id TEXT NOT NULL, team_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Landing page submissions
  const lpSubmissionsDDL = isPg
    ? `CREATE TABLE IF NOT EXISTS landing_page_submissions (
        id SERIAL PRIMARY KEY,
        landing_page_id TEXT NOT NULL,
        lead_id TEXT,
        form_data TEXT NOT NULL DEFAULT '{}',
        ip_address TEXT, user_agent TEXT, referrer TEXT,
        utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS landing_page_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        landing_page_id TEXT NOT NULL,
        lead_id TEXT,
        form_data TEXT NOT NULL DEFAULT '{}',
        ip_address TEXT, user_agent TEXT, referrer TEXT,
        utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (landing_page_id) REFERENCES landing_pages(id) ON DELETE CASCADE
      )`;
  await db.exec(lpSubmissionsDDL);

  // Workflow automations
  await ddl(`
    CREATE TABLE IF NOT EXISTS workflow_automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL, description TEXT,
      trigger_type TEXT NOT NULL,
      trigger_config TEXT DEFAULT '{}',
      actions TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      execution_count INTEGER DEFAULT 0,
      last_executed_at TEXT,
      owner_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Inbox messages
  await ddl(`
    CREATE TABLE IF NOT EXISTS inbox_messages (
      id TEXT PRIMARY KEY,
      lead_id TEXT, deal_id TEXT, user_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      direction TEXT NOT NULL,
      from_address TEXT, to_address TEXT, subject TEXT,
      body TEXT NOT NULL, body_html TEXT,
      is_read INTEGER DEFAULT 0,
      thread_id TEXT, external_id TEXT,
      cadence_execution_id INTEGER,
      attachments TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // AI conversations
  await ddl(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      lead_id TEXT, user_id TEXT NOT NULL,
      context_type TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      model TEXT DEFAULT 'claude-sonnet-4-5-20250514',
      tokens_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Migrations (must run BEFORE indexes) ──
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
    await pgSafeAddColumn('pipelines', 'team_id', 'TEXT');
    await pgSafeAddColumn('deals', 'loss_reason', 'TEXT');
    await pgSafeAddColumn('deals', 'num_employees', 'INTEGER');
    await pgSafeAddColumn('deals', 'product_id', 'TEXT');
    await pgSafeAddColumn('users', 'uf', 'TEXT');
  } else {
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
    await safeAddColumn('pipelines', 'team_id', 'TEXT');
    await safeAddColumn('deals', 'loss_reason', 'TEXT');
    try { await ddl('ALTER TABLE deals ADD COLUMN num_employees INTEGER'); } catch {}
    try { await ddl('ALTER TABLE deals ADD COLUMN product_id TEXT'); } catch {}
    await safeAddColumn('users', 'uf', 'TEXT');
    await safeAddColumn('leads', 'uf', 'TEXT');
    await safeAddColumn('leads', 'municipio', 'TEXT');
  }

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
    CREATE INDEX IF NOT EXISTS idx_teams_active ON teams(is_active);
    CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_pipelines_created_by ON pipelines(created_by);
    CREATE INDEX IF NOT EXISTS idx_pipelines_team ON pipelines(team_id);
    CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);
    CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);
    CREATE INDEX IF NOT EXISTS idx_deal_activities_deal ON deal_activities(deal_id);
    CREATE INDEX IF NOT EXISTS idx_deal_tasks_deal ON deal_tasks(deal_id);
    CREATE INDEX IF NOT EXISTS idx_proposals_entity ON proposals(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_proposals_template ON proposals(template_id);
    CREATE INDEX IF NOT EXISTS idx_proposal_templates_active ON proposal_templates(is_active);
    CREATE INDEX IF NOT EXISTS idx_deal_tasks_assigned ON deal_tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_deal_contacts_deal ON deal_contacts(deal_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_entity ON contracts(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_template ON contracts(template_id);
    CREATE INDEX IF NOT EXISTS idx_contract_templates_active ON contract_templates(is_active);
    CREATE INDEX IF NOT EXISTS idx_contracts_clicksign ON contracts(clicksign_document_key);
    CREATE INDEX IF NOT EXISTS idx_pipeline_automations_pipeline ON pipeline_automations(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_pipeline_automations_trigger ON pipeline_automations(trigger_stage_id);
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
    CREATE INDEX IF NOT EXISTS idx_leads_cnpj ON leads(cnpj);
    CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(total_score);
    CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(temperature);
    CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
    CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
    CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
    CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities(type);
    CREATE INDEX IF NOT EXISTS idx_cadences_owner ON cadences(owner_id);
    CREATE INDEX IF NOT EXISTS idx_cadences_status ON cadences(status);
    CREATE INDEX IF NOT EXISTS idx_cadence_steps_cadence ON cadence_steps(cadence_id);
    CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_cadence ON cadence_enrollments(cadence_id);
    CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_lead ON cadence_enrollments(lead_id);
    CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_status ON cadence_enrollments(status);
    CREATE INDEX IF NOT EXISTS idx_cadence_enrollments_next ON cadence_enrollments(next_step_at);
    CREATE INDEX IF NOT EXISTS idx_cadence_executions_enrollment ON cadence_executions(enrollment_id);
    CREATE INDEX IF NOT EXISTS idx_cadence_executions_cadence ON cadence_executions(cadence_id);
    CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug);
    CREATE INDEX IF NOT EXISTS idx_landing_pages_status ON landing_pages(status);
    CREATE INDEX IF NOT EXISTS idx_lp_submissions_page ON landing_page_submissions(landing_page_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_trigger ON workflow_automations(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_workflow_active ON workflow_automations(is_active);
    CREATE INDEX IF NOT EXISTS idx_inbox_user ON inbox_messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_inbox_lead ON inbox_messages(lead_id);
    CREATE INDEX IF NOT EXISTS idx_inbox_channel ON inbox_messages(channel);
    CREATE INDEX IF NOT EXISTS idx_inbox_read ON inbox_messages(is_read);
    CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_conv_lead ON ai_conversations(lead_id);
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

}

export default { getDatabase, initializeDatabase };
