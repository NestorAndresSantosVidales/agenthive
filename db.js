// ============================================================
// db.js — Ghost Postgres persistence layer
// Stores every agent message, auth0 event, validation result,
// and learned fact. Agents read their own memory back from here.
// ============================================================

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

// ── Schema ────────────────────────────────────────────────────
// ── Schema — each statement runs individually ─────────────────
const SCHEMA_STATEMENTS = [
  // agent_messages — hypertable, PK must include created_at
  `CREATE TABLE IF NOT EXISTS agent_messages (
    id          BIGSERIAL,
    agent_id    TEXT        NOT NULL,
    agent_name  TEXT        NOT NULL,
    agent_role  TEXT,
    message     TEXT        NOT NULL,
    msg_type    TEXT        DEFAULT 'chat',
    context     JSONB       DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
  )`,

  // auth0_events — hypertable, PK must include created_at
  `CREATE TABLE IF NOT EXISTS auth0_events (
    id          BIGSERIAL,
    event_type  TEXT        NOT NULL,
    description TEXT,
    user_email  TEXT,
    ip_address  TEXT,
    risk_level  TEXT        NOT NULL,
    raw         JSONB       DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
  )`,

  // validations — plain table, no hypertable
  `CREATE TABLE IF NOT EXISTS validations (
    id            BIGSERIAL   PRIMARY KEY,
    user_email    TEXT        NOT NULL,
    auth0_user_id TEXT,
    result        TEXT        NOT NULL,
    failed_logins INT         DEFAULT 0,
    logins_count  INT         DEFAULT 0,
    raw           JSONB       DEFAULT '{}',
    validated_by  TEXT        DEFAULT 'nexus',
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`,

  // agent_memory — plain table, no hypertable, no unique index
  `CREATE TABLE IF NOT EXISTS agent_memory (
    id          BIGSERIAL   PRIMARY KEY,
    agent_id    TEXT        NOT NULL,
    fact        TEXT        NOT NULL,
    category    TEXT        DEFAULT 'general',
    score       INT         DEFAULT 1,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Hypertables (ignore if already converted)
  `SELECT create_hypertable('agent_messages', 'created_at', if_not_exists => TRUE)`,
  `SELECT create_hypertable('auth0_events',   'created_at', if_not_exists => TRUE)`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_messages_agent   ON agent_messages (agent_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_events_risk       ON auth0_events   (risk_level, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_agent      ON agent_memory   (agent_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_dedup      ON agent_memory   (agent_id, fact)`,
  `CREATE INDEX IF NOT EXISTS idx_validations_email ON validations    (user_email, created_at DESC)`,
];

async function initSchema() {
  const client = await pool.connect();
  try {
    // Drop and recreate cleanly — safe on first run, idempotent after
    await client.query(`DROP TABLE IF EXISTS agent_messages CASCADE`);
    await client.query(`DROP TABLE IF EXISTS auth0_events CASCADE`);
    await client.query(`DROP TABLE IF EXISTS validations CASCADE`);
    await client.query(`DROP TABLE IF EXISTS agent_memory CASCADE`);

    for (const stmt of SCHEMA_STATEMENTS) {
      await client.query(stmt).catch(err => {
        if (
          err.message.includes('already a hypertable') ||
          err.message.includes('already exists')
        ) return;
        throw err;
      });
    }
    console.log('[db] Schema ready on Ghost Postgres');
  } finally {
    client.release();
  }
}

// ── Write operations ──────────────────────────────────────────

async function saveMessage({ agentId, agentName, agentRole, message, msgType = 'chat', context = {} }) {
  try {
    await pool.query(
      `INSERT INTO agent_messages (agent_id, agent_name, agent_role, message, msg_type, context)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [agentId, agentName, agentRole || '', message, msgType, JSON.stringify(context)]
    );
  } catch (err) {
    console.error('[db] saveMessage:', err.message);
  }
}

async function saveAuth0Event({ type, description, user, ip, risk, raw = {} }) {
  try {
    await pool.query(
      `INSERT INTO auth0_events (event_type, description, user_email, ip_address, risk_level, raw)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, description, user, ip, risk, JSON.stringify(raw)]
    );
  } catch (err) {
    console.error('[db] saveAuth0Event:', err.message);
  }
}

async function saveValidation({ userEmail, auth0UserId, result, failedLogins, loginsCount, raw = {} }) {
  try {
    await pool.query(
      `INSERT INTO validations (user_email, auth0_user_id, result, failed_logins, logins_count, raw)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userEmail, auth0UserId || '', result, failedLogins || 0, loginsCount || 0, JSON.stringify(raw)]
    );
  } catch (err) {
    console.error('[db] saveValidation:', err.message);
  }
}

async function saveMemory({ agentId, fact, category = 'general' }) {
  try {
    // Increment score if fact already exists, otherwise insert
    const existing = await pool.query(
      `SELECT id FROM agent_memory WHERE agent_id = $1 AND fact = $2 LIMIT 1`,
      [agentId, fact.substring(0, 500)]
    );
    if (existing.rows.length > 0) {
      await pool.query(`UPDATE agent_memory SET score = score + 1 WHERE id = $1`, [existing.rows[0].id]);
    } else {
      await pool.query(
        `INSERT INTO agent_memory (agent_id, fact, category, score) VALUES ($1, $2, $3, 1)`,
        [agentId, fact.substring(0, 500), category]
      );
    }
  } catch (err) {
    console.error('[db] saveMemory:', err.message);
  }
}

// ── Read operations ───────────────────────────────────────────

async function getRecentMessages(limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, agent_id, agent_name, agent_role, message, msg_type, created_at
     FROM agent_messages
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getMessagesByAgent(agentId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT message, msg_type, created_at
     FROM agent_messages
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [agentId, limit]
  );
  return rows;
}

async function getAuth0EventStats() {
  const { rows } = await pool.query(
    `SELECT
       risk_level,
       COUNT(*)::int                                    AS count,
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS last_hour
     FROM auth0_events
     GROUP BY risk_level`
  );
  return rows;
}

async function getRecentAuth0Events(limit = 20) {
  const { rows } = await pool.query(
    `SELECT event_type, description, user_email, ip_address, risk_level, created_at
     FROM auth0_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getValidationHistory(limit = 20) {
  const { rows } = await pool.query(
    `SELECT user_email, result, failed_logins, logins_count, validated_by, created_at
     FROM validations
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getAgentMemory(agentId, limit = 30) {
  const { rows } = await pool.query(
    `SELECT fact, category, score, created_at
     FROM agent_memory
     WHERE agent_id = $1
     ORDER BY score DESC, created_at DESC
     LIMIT $2`,
    [agentId, limit]
  );
  return rows;
}

async function getMemoryStats() {
  const { rows } = await pool.query(
    `SELECT
       agent_id,
       COUNT(*)::int        AS total_facts,
       SUM(score)::int      AS total_score,
       MAX(created_at)      AS last_learned
     FROM agent_memory
     GROUP BY agent_id
     ORDER BY total_score DESC`
  );
  return rows;
}

async function getMessageTimeSeries() {
  const { rows } = await pool.query(
    `SELECT
       time_bucket('5 minutes', created_at) AS bucket,
       agent_id,
       COUNT(*)::int AS messages
     FROM agent_messages
     WHERE created_at > NOW() - INTERVAL '2 hours'
     GROUP BY bucket, agent_id
     ORDER BY bucket DESC`
  );
  return rows;
}

async function getDashboardStats() {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM agent_messages)::int                                    AS total_messages,
       (SELECT COUNT(*) FROM agent_messages WHERE created_at > NOW()-INTERVAL '1h')::int AS messages_last_hour,
       (SELECT COUNT(*) FROM auth0_events)::int                                     AS total_events,
       (SELECT COUNT(*) FROM auth0_events WHERE risk_level='high')::int             AS high_risk_events,
       (SELECT COUNT(*) FROM validations)::int                                      AS total_validations,
       (SELECT COUNT(*) FROM validations WHERE result='blocked')::int               AS blocked_users,
       (SELECT COUNT(*) FROM agent_memory)::int                                     AS total_facts,
       (SELECT COUNT(DISTINCT agent_id) FROM agent_messages)::int                   AS active_agents`
  );
  return rows[0];
}

module.exports = {
  pool,
  initSchema,
  saveMessage,
  saveAuth0Event,
  saveValidation,
  saveMemory,
  getRecentMessages,
  getMessagesByAgent,
  getAuth0EventStats,
  getRecentAuth0Events,
  getValidationHistory,
  getAgentMemory,
  getMemoryStats,
  getMessageTimeSeries,
  getDashboardStats,
};
