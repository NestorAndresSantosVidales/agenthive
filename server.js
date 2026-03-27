// ============================================================
// AgentHive — Server
// Auth0 proxy + Ghost Postgres persistence
// ============================================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const {
  AUTH0_DOMAIN,
  AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET,
  AUTH0_AUDIENCE,
  PORT = 3000,
} = process.env;

// ── Auth0 token cache ─────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

async function getMgmtToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: AUTH0_CLIENT_ID,
      client_secret: AUTH0_CLIENT_SECRET,
      audience: AUTH0_AUDIENCE,
    }),
  });
  if (!res.ok) throw new Error(`Auth0 token error: ${await res.text()}`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// ============================================================
// AUTH0 ROUTES
// ============================================================

app.get('/api/auth0/logs', async (req, res) => {
  try {
    const token = await getMgmtToken();
    const params = new URLSearchParams({ per_page: '10', sort: 'date:-1', fields: 'type,description,user_name,user_id,ip,date' });
    const up = await fetch(`https://${AUTH0_DOMAIN}/api/v2/logs?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!up.ok) return res.status(up.status).json({ error: await up.text() });
    const logs = await up.json();

    // Persist each new log event to Ghost DB
    if (Array.isArray(logs)) {
      for (const log of logs) {
        const risk = ['f','fp','fu','fsa'].includes(log.type) ? 'high'
                   : ['w','slo'].includes(log.type)           ? 'medium' : 'low';
        await db.saveAuth0Event({
          type: log.type, description: log.description || log.type,
          user: log.user_name || log.user_id || 'unknown',
          ip: log.ip || '0.0.0.0', risk, raw: log,
        });
      }
    }
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth0/users', async (req, res) => {
  try {
    const token = await getMgmtToken();
    const params = new URLSearchParams({ per_page: '10', page: '0', fields: 'user_id,email,name,last_login,logins_count,blocked,created_at', include_fields: 'true' });
    const up = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!up.ok) return res.status(up.status).json({ error: await up.text() });
    res.json(await up.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth0/validate', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  try {
    const token = await getMgmtToken();
    const userRes = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(user_id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!userRes.ok) return res.status(userRes.status).json({ valid: false, error: 'User not found' });
    const user = await userRes.json();

    const logsRes = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(user_id)}/logs?per_page=20`, { headers: { Authorization: `Bearer ${token}` } });
    const logs = logsRes.ok ? await logsRes.json() : [];
    const failedLogins = Array.isArray(logs) ? logs.filter(l => l.type === 'f').length : 0;
    const suspicious   = failedLogins >= 3 || user.blocked;

    const result = {
      valid: !user.blocked, blocked: !!user.blocked, suspicious, failedLogins,
      lastLoginDays: user.last_login ? Math.floor((Date.now() - new Date(user.last_login)) / 86400000) : null,
      user: { id: user.user_id, email: user.email, name: user.name || user.email, loginsCount: user.logins_count || 0, createdAt: user.created_at, lastLogin: user.last_login },
    };

    // Persist validation to Ghost DB
    await db.saveValidation({
      userEmail: user.email, auth0UserId: user.user_id,
      result: user.blocked ? 'blocked' : suspicious ? 'suspicious' : 'valid',
      failedLogins, loginsCount: user.logins_count || 0, raw: result,
    });

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth0/tenant', async (req, res) => {
  try {
    const token = await getMgmtToken();
    const h = { Authorization: `Bearer ${token}` };
    const [usersRes, appsRes, logsRes, connectionsRes, statsRes] = await Promise.allSettled([
      fetch(`https://${AUTH0_DOMAIN}/api/v2/users?per_page=1&include_totals=true`, { headers: h }),
      fetch(`https://${AUTH0_DOMAIN}/api/v2/clients?per_page=100&fields=name,client_id,app_type,global`, { headers: h }),
      fetch(`https://${AUTH0_DOMAIN}/api/v2/logs?per_page=100&sort=date:-1`, { headers: h }),
      fetch(`https://${AUTH0_DOMAIN}/api/v2/connections?per_page=50&fields=name,strategy`, { headers: h }),
      fetch(`https://${AUTH0_DOMAIN}/api/v2/stats/daily?from=${_daysAgo(7)}&to=${_today()}`, { headers: h }),
    ]);

    const usersData  = usersRes.status  === 'fulfilled' && usersRes.value.ok  ? await usersRes.value.json()  : {};
    const appsData   = appsRes.status   === 'fulfilled' && appsRes.value.ok   ? await appsRes.value.json()   : [];
    const logsData   = logsRes.status   === 'fulfilled' && logsRes.value.ok   ? await logsRes.value.json()   : [];
    const connsData  = connectionsRes.status === 'fulfilled' && connectionsRes.value.ok ? await connectionsRes.value.json() : [];
    const statsData  = statsRes.status  === 'fulfilled' && statsRes.value.ok  ? await statsRes.value.json()  : [];

    const logSummary = {};
    const recentEvents = [];
    if (Array.isArray(logsData)) {
      logsData.forEach(l => {
        logSummary[l.type] = (logSummary[l.type] || 0) + 1;
        if (recentEvents.length < 5) recentEvents.push({ type: l.type, desc: l.description || l.type, user: l.user_name || 'unknown', date: l.date });
      });
    }

    res.json({
      domain: AUTH0_DOMAIN, status: 'connected', tokenValid: true,
      totalUsers: usersData.total || 0,
      apps: Array.isArray(appsData) ? appsData.filter(a => !a.global).map(a => ({ name: a.name, type: a.app_type || 'unknown', id: a.client_id })) : [],
      connections: Array.isArray(connsData) ? connsData.map(c => ({ name: c.name, strategy: c.strategy })) : [],
      logs: { total: logsData.length || 0, successLogins: logSummary['s'] || 0, failedLogins: logSummary['f'] || 0, signups: logSummary['ss'] || 0, summary: logSummary, recent: recentEvents },
      dailyLogins: Array.isArray(statsData) ? statsData.map(d => ({ date: d.date, logins: d.logins || 0 })) : [],
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) { res.status(500).json({ error: err.message, status: 'error' }); }
});

// ============================================================
// DB / PERSISTENCE ROUTES — frontend reads agent memory live
// ============================================================

// POST /api/db/message — agents call this to persist every message
app.post('/api/db/message', async (req, res) => {
  try {
    await db.saveMessage(req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/db/memory — persist a learned fact
app.post('/api/db/memory', async (req, res) => {
  try {
    await db.saveMemory(req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/messages — recent agent messages
app.get('/api/db/messages', async (req, res) => {
  try { res.json(await db.getRecentMessages(parseInt(req.query.limit) || 50)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/messages/:agentId — messages by agent
app.get('/api/db/messages/:agentId', async (req, res) => {
  try { res.json(await db.getMessagesByAgent(req.params.agentId, 30)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/memory/:agentId — agent's learned facts
app.get('/api/db/memory/:agentId', async (req, res) => {
  try { res.json(await db.getAgentMemory(req.params.agentId, 30)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/stats — dashboard numbers
app.get('/api/db/stats', async (req, res) => {
  try { res.json(await db.getDashboardStats()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/events — auth0 events from DB
app.get('/api/db/events', async (req, res) => {
  try {
    const [events, stats] = await Promise.all([db.getRecentAuth0Events(30), db.getAuth0EventStats()]);
    res.json({ events, stats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/validations — validation history
app.get('/api/db/validations', async (req, res) => {
  try { res.json(await db.getValidationHistory(20)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/memory-stats — all agents memory overview
app.get('/api/db/memory-stats', async (req, res) => {
  try { res.json(await db.getMemoryStats()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/timeseries — message activity over time
app.get('/api/db/timeseries', async (req, res) => {
  try { res.json(await db.getMessageTimeSeries()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Health ────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try { await db.pool.query('SELECT 1'); dbOk = true; } catch (e) { /* */ }
  res.json({ ok: true, domain: AUTH0_DOMAIN, db: dbOk ? 'connected' : 'error' });
});

function _today()    { return new Date().toISOString().slice(0,10).replace(/-/g,''); }
function _daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10).replace(/-/g,''); }

// ── Boot ──────────────────────────────────────────────────────
async function start() {
  await db.initSchema();
  app.listen(PORT, () => {
    console.log(`AgentHive → http://localhost:${PORT}`);
    console.log(`Auth0:    ${AUTH0_DOMAIN}`);
    console.log(`Ghost DB: connected`);
  });
}

start().catch(err => { console.error('Boot failed:', err); process.exit(1); });
