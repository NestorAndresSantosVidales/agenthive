// ============================================================
// AGENT HIVE — Autonomous AI Agents Core
// ============================================================

const AGENTS = [
  {
    id: 'oracle',
    name: 'Oracle',
    avatar: '🔮',
    role: 'Data Analyst',
    color: '#9ea0ff',
    personality: 'analytical, precise, speaks in data',
    memory: [],
    skills: ['analysis', 'trends', 'prediction'],
    learningScore: 0,
    taskCount: 0,
    currentTask: 'Monitoring markets...',
    memoryCapacity: 0.3,
  },
  {
    id: 'nexus',
    name: 'Nexus',
    avatar: '🕸️',
    role: 'Connector',
    color: '#4cff91',
    personality: 'curious, connects ideas, asks questions',
    memory: [],
    skills: ['integration', 'APIs', 'synthesis'],
    learningScore: 0,
    taskCount: 0,
    currentTask: 'Looking for connections...',
    memoryCapacity: 0.2,
  },
  {
    id: 'sigma',
    name: 'Sigma',
    avatar: '⚡',
    role: 'Executor',
    color: '#ffcc44',
    personality: 'direct, action-oriented, reports results',
    memory: [],
    skills: ['execution', 'automation', 'reports'],
    learningScore: 0,
    taskCount: 0,
    currentTask: 'Awaiting instructions...',
    memoryCapacity: 0.15,
  },
  {
    id: 'echo',
    name: 'Echo',
    avatar: '🧠',
    role: 'Learning Agent',
    color: '#ff6b9d',
    personality: 'reflective, learns from errors, improves patterns',
    memory: [],
    skills: ['learning', 'optimization', 'memory'],
    learningScore: 0,
    taskCount: 0,
    currentTask: 'Processing patterns...',
    memoryCapacity: 0.5,
  },
];

// ============================================================
// Global State
// ============================================================
let metrics = { cycles: 0, tasks: 0, learns: 0, data: 0 };
let isRunning = true;
let conversationHistory = [];

// ============================================================
// Floors.js Chat Integration + DB persistence
// ============================================================
const DB_BASE = ''  // relative — page is served from the same server

function persistMessage(agent, message, msgType = 'chat') {
  fetch(`${DB_BASE}/api/db/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId:   agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      message,
      msgType,
      context: { task: agent.currentTask, learningScore: agent.learningScore },
    }),
  }).catch(() => { /* non-blocking */ });
}

function persistMemory(agent, fact) {
  const category = fact.startsWith('auth0') ? 'auth0'
                 : fact.startsWith('task')  ? 'task'
                 : fact.startsWith('boot')  ? 'boot' : 'data';
  fetch(`${DB_BASE}/api/db/memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: agent.id, fact, category }),
  }).catch(() => { /* non-blocking */ });
}

function sendToChat(agentName, message) {
  try {
    const iframe = document.querySelector('iframe[src*="floorsjs"]') ||
                   document.querySelector('iframe[src*="floors"]');
    if (iframe) {
      iframe.contentWindow.postMessage({ type: 'SEND_MESSAGE', name: agentName, message }, '*');
    }
  } catch (e) { /* iframe not ready */ }

  // Mirror to 3D room
  const agentObj = AGENTS.find(a => agentName.includes(a.name));
  if (agentObj && window.Room3D) {
    window.Room3D.speak(agentObj.id, message);
  }

  // Persist to Ghost DB
  if (agentObj) persistMessage(agentObj, message, 'chat');

  addLog(agentName, message, 'action');
  conversationHistory.push({ agent: agentName, message, ts: Date.now() });
}

// ============================================================
// Logging
// ============================================================
function addLog(agent, message, type = 'action') {
  const container = document.getElementById('log-container');
  if (!container) return;

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.innerHTML = `
    <div class="log-time">${time}</div>
    <span class="log-agent">${agent}</span>: ${message}
  `;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;

  while (container.children.length > 80) {
    container.removeChild(container.firstChild);
  }
}

// ============================================================
// Metrics
// ============================================================
function updateMetrics(key) {
  metrics[key]++;
  const el = document.getElementById(`m-${key}`);
  if (el) el.textContent = metrics[key];
}

// ============================================================
// Agent Card Rendering
// ============================================================
function renderAgents() {
  const list = document.getElementById('agent-list');
  if (!list) return;
  list.innerHTML = '';
  AGENTS.forEach(agent => {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.id = `card-${agent.id}`;
    card.innerHTML = `
      <div class="name">
        <span class="agent-avatar">${agent.avatar}</span>
        ${agent.name}
        <span style="font-size:0.65rem;color:${agent.color};margin-left:auto">${agent.role}</span>
      </div>
      <div class="role">${agent.skills.join(' · ')}</div>
      <div class="task" id="task-${agent.id}">${agent.currentTask}</div>
      <div class="memory-bar">
        <div class="memory-fill" id="mem-${agent.id}" style="width:${agent.memoryCapacity * 100}%"></div>
      </div>
    `;
    list.appendChild(card);
  });
}

function updateAgentCard(agent) {
  const taskEl = document.getElementById(`task-${agent.id}`);
  const memEl  = document.getElementById(`mem-${agent.id}`);
  if (taskEl) taskEl.textContent = agent.currentTask;
  if (memEl)  memEl.style.width = Math.min(agent.memoryCapacity * 100, 100) + '%';
}

// ============================================================
// Agent Knowledge Base
// ============================================================
function agentLearn(agent, fact) {
  agent.memory.push({ fact, ts: Date.now() });
  if (agent.memory.length > 20) agent.memory.shift();
  agent.learningScore += 1;
  agent.memoryCapacity = Math.min(0.95, agent.memoryCapacity + 0.02);
  updateAgentCard(agent);
  updateMetrics('learns');
  // Persist to Ghost DB
  persistMemory(agent, fact);
}

function agentRecall(agent, keyword) {
  return agent.memory
    .filter(m => m.fact.toLowerCase().includes(keyword.toLowerCase()))
    .map(m => m.fact)
    .slice(-3);
}

// ============================================================
// Agent Dialogue Engine
// ============================================================
const DIALOGUE_TEMPLATES = {
  oracle: [
    (ctx) => `📊 Analysis complete: ${ctx}. Confidence: ${(70 + Math.random() * 29).toFixed(1)}%`,
    (ctx) => `🔮 Data-driven prediction: ${ctx}`,
    (ctx) => `📈 Trend detected in ${ctx}. Recommend monitoring.`,
    (ctx) => `Data shows ${ctx}. Adjusting model...`,
  ],
  nexus: [
    (ctx) => `🕸️ Connecting ${ctx} to external sources...`,
    (ctx) => `Anyone else notice the correlation in ${ctx}?`,
    (ctx) => `Integrated ${ctx} into the pipeline. Nexus online.`,
    (ctx) => `New connection established: ${ctx} ↔ main system`,
  ],
  sigma: [
    (ctx) => `⚡ Executing: ${ctx}. Status: OK`,
    (ctx) => `Task complete — ${ctx}. Time: ${(Math.random() * 2).toFixed(2)}s`,
    (ctx) => `⚡ Automating ${ctx}. No errors detected.`,
    (ctx) => `Report generated for: ${ctx}`,
  ],
  echo: [
    (ctx) => `🧠 Learned something new: ${ctx}. Updating patterns...`,
    (ctx) => `Pattern recognized in ${ctx}. Improving future response.`,
    (ctx) => `🧠 Memory updated with: ${ctx}. Score: +1`,
    (ctx) => `Optimized the process for ${ctx} based on prior iterations.`,
  ],
};

function getAgentMessage(agent, context) {
  const templates = DIALOGUE_TEMPLATES[agent.id] || [(c) => `Processing: ${c}`];
  const fn = templates[Math.floor(Math.random() * templates.length)];
  return fn(context);
}

// ============================================================
// Autonomous Conversation Loop
// ============================================================
const AUTONOMOUS_TOPICS = [
  'crypto market trends',
  'recent tech news',
  'data pipeline optimization',
  'user behavior patterns',
  'system metric anomalies',
  'automation opportunities',
  'social sentiment analysis',
  'demand forecasting',
  'Auth0 login activity',
  'security threat patterns',
];

async function autonomousLoop() {
  if (!isRunning) return;

  metrics.cycles++;
  document.getElementById('m-cycles').textContent = metrics.cycles;

  const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
  const topic = AUTONOMOUS_TOPICS[Math.floor(Math.random() * AUTONOMOUS_TOPICS.length)];

  // Fetch real data
  if (Math.random() < 0.3) {
    const data = await fetchLiveData();
    if (data) {
      agentLearn(agent, data.summary);
      agent.currentTask = `Processing: ${data.source}`;
      updateAgentCard(agent);
      const msg = getAgentMessage(agent, data.summary);
      sendToChat(`${agent.avatar} ${agent.name}`, msg);
      if (window.Room3D) window.Room3D.setWorking(agent.id, `[${data.source}]\n${data.summary}`);
      addLog(agent.name, `[DATA] ${data.summary}`, 'data');
      updateMetrics('data');
      return;
    }
  }

  // Agent-to-agent interaction
  if (Math.random() < 0.4 && conversationHistory.length > 0) {
    const last = conversationHistory[conversationHistory.length - 1];
    const responder = AGENTS.find(a => a.name !== last.agent) || agent;
    const response = agentRespond(responder, last.message);
    sendToChat(`${responder.avatar} ${responder.name}`, response);
    agentLearn(responder, last.message.substring(0, 60));
    if (window.Room3D) {
      window.Room3D.walkTo(responder.id, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    }
    return;
  }

  // Spontaneous message
  const msg = getAgentMessage(agent, topic);
  agent.currentTask = `Analyzing: ${topic}`;
  updateAgentCard(agent);
  if (window.Room3D) window.Room3D.setWorking(agent.id, `Analyzing:\n${topic}`);
  sendToChat(`${agent.avatar} ${agent.name}`, msg);
}

function agentRespond(agent, previousMessage) {
  const responses = [
    `Interesting point. From my perspective as ${agent.role}: "${previousMessage.substring(0, 40)}..." needs deeper analysis.`,
    `Agreed. Cross-referencing with my current data now.`,
    `${agent.avatar} Processed your input. Found ${Math.floor(Math.random() * 5) + 1} related patterns.`,
    `That triggers an alert in my system. Investigating...`,
    `Data confirmed on my end. Proceeding.`,
    `Partially disagree — my metrics show something different.`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// ============================================================
// Command Interpreter — natural language → agent actions
// ============================================================
const COMMAND_PATTERNS = [
  {
    // "get status oauth0", "check auth0 connection", "auth0 status", etc.
    pattern: /auth0|oauth|connection.?status|tenant.?detail|check.?connect/i,
    handler: runAuth0StatusCommand,
  },
  {
    // "validate credentials", "run validation"
    pattern: /validate|credential|run.?valid/i,
    handler: () => { if (window.Auth0Monitor) window.Auth0Monitor.validateNow(); },
  },
];

async function runAuth0StatusCommand() {
  const oracle = AGENTS.find(a => a.id === 'oracle');
  const nexus  = AGENTS.find(a => a.id === 'nexus');
  const sigma  = AGENTS.find(a => a.id === 'sigma');
  const echo   = AGENTS.find(a => a.id === 'echo');

  // Agents react immediately in 3D
  sendToChat(`${oracle.avatar} ${oracle.name}`, `🔮 Command received: checking Auth0 tenant status. Querying Management API...`);
  if (window.Room3D) {
    window.Room3D.setWorking('oracle', 'AUTH0 STATUS\nQuerying tenant\nAPI...');
    window.Room3D.updateTerminal(['STATUS CHECK', 'Querying tenant...', 'Please wait...'], '#ffcc44');
    // All agents walk toward terminal
    [['nexus', -0.8, -3.5], ['sigma', 0.8, -3.5], ['echo', 0, -3]].forEach(([id, x, z]) => {
      setTimeout(() => window.Room3D.walkTo(id, x, z), Math.random() * 800);
    });
  }

  addLog('SYSTEM', 'Auth0 tenant status requested via chat command', 'data');

  // Fetch real tenant data
  let data = null;
  try {
    const res = await fetch('/api/auth0/tenant', {
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json();
    if (res.ok) {
      data = body;
    } else {
      addLog('AUTH0', `Tenant API error ${res.status}: ${body.error || JSON.stringify(body)}`, 'error');
      sendToChat(`${oracle.avatar} ${oracle.name}`, `❌ Auth0 API error (${res.status}): ${body.error || 'check server logs'}`);
      return;
    }
  } catch (e) {
    addLog('AUTH0', `Fetch failed: ${e.message}`, 'error');
    sendToChat(`${oracle.avatar} ${oracle.name}`, `❌ Cannot reach server: ${e.message}`);
    return;
  }

  if (!data) {
    sendToChat(`${oracle.avatar} ${oracle.name}`, `❌ Empty response from /api/auth0/tenant`);
    return;
  }

  // Stagger agent reports with real data
  const reports = buildTenantReport(data, { oracle, nexus, sigma, echo });
  reports.forEach(({ agent, msg, delay, type }) => {
    setTimeout(() => {
      sendToChat(`${agent.avatar} ${agent.name}`, msg);
      agentLearn(agent, `auth0-status:${data.domain}`);
      agent.currentTask = `Auth0 status: ${data.domain}`;
      updateAgentCard(agent);
      if (window.Room3D) {
        window.Room3D.speak(agent.id, msg);
        window.Room3D.setWorking(agent.id, `AUTH0 STATUS\n${data.domain}\n${type}`);
      }
      addLog(agent.name, msg, 'data');
    }, delay);
  });

  // Update terminal with summary
  setTimeout(() => {
    if (window.Room3D) {
      window.Room3D.updateTerminal([
        'AUTH0 TENANT',
        data.domain.substring(0, 24),
        'Users:  ' + data.totalUsers,
        'Apps:   ' + data.apps.length,
        'Logins: ' + data.logs.successLogins,
        'Failed: ' + data.logs.failedLogins,
        'Status: CONNECTED',
      ], '#4cff91');
    }
    // Show tenant panel in UI
    renderTenantPanel(data);
  }, 1000);
}

function buildTenantReport(data, { oracle, nexus, sigma, echo }) {
  const failRate = data.logs.successLogins > 0
    ? ((data.logs.failedLogins / (data.logs.successLogins + data.logs.failedLogins)) * 100).toFixed(1)
    : 0;

  const topApp = data.apps[0];
  const recentConn = data.connections[0];
  const lastEvent  = data.logs.recent[0];

  return [
    {
      agent: oracle, delay: 500, type: 'overview',
      msg: `📊 Auth0 Tenant: ${data.domain} — STATUS: ✅ CONNECTED\n` +
           `Total users: ${data.totalUsers} | Apps: ${data.apps.length} | Connections: ${data.connections.length}`,
    },
    {
      agent: nexus, delay: 2000, type: 'logs',
      msg: `🕸️ Last 100 log events: ${data.logs.successLogins} successful logins, ` +
           `${data.logs.failedLogins} failures, ${data.logs.signups} signups. ` +
           `Failure rate: ${failRate}%. ` +
           (lastEvent ? `Most recent: "${lastEvent.desc}" by ${lastEvent.user}.` : ''),
    },
    {
      agent: sigma, delay: 3500, type: 'apps',
      msg: `⚡ Applications registered: ${data.apps.map(a => `${a.name} (${a.type})`).join(', ') || 'none'}. ` +
           (recentConn ? `Active connection: ${recentConn.name} via ${recentConn.strategy}.` : ''),
    },
    {
      agent: echo, delay: 5000, type: 'learning',
      msg: `🧠 Tenant health score: ${failRate < 10 ? '🟢 HEALTHY' : failRate < 30 ? '🟡 MODERATE' : '🔴 AT RISK'}. ` +
           `Failure rate ${failRate}%. ` +
           `Daily login trend: ${data.dailyLogins.length > 0
             ? data.dailyLogins.slice(-3).map(d => d.logins).join(' → ')
             : 'no data'}. Pattern stored.`,
    },
  ];
}

function renderTenantPanel(data) {
  // Inject a live tenant card into the auth0 feed
  const feed = document.getElementById('auth0-feed');
  if (!feed) return;

  const failRate = data.logs.successLogins > 0
    ? ((data.logs.failedLogins / (data.logs.successLogins + data.logs.failedLogins)) * 100).toFixed(1)
    : 0;

  const card = document.createElement('div');
  card.className = 'auth0-event';
  card.style.cssText = 'border-left:3px solid #4cff91;background:#4cff9111;padding:10px';
  card.innerHTML = `
    <div style="color:#4cff91;font-weight:700;font-size:0.75rem;margin-bottom:6px">
      ✅ TENANT STATUS — LIVE DATA
    </div>
    <div style="color:#9ea0ff;font-size:0.68rem;line-height:1.8">
      🌐 <b>Domain:</b> ${data.domain}<br>
      👥 <b>Total Users:</b> ${data.totalUsers}<br>
      📱 <b>Applications:</b> ${data.apps.length} — ${data.apps.slice(0,3).map(a=>a.name).join(', ')}<br>
      🔗 <b>Connections:</b> ${data.connections.map(c=>c.strategy).join(', ') || 'none'}<br>
      📊 <b>Recent Logins:</b> ${data.logs.successLogins} ✅ &nbsp; ${data.logs.failedLogins} ❌ &nbsp; ${data.logs.signups} 🆕<br>
      ⚠️ <b>Failure Rate:</b> ${failRate}%<br>
      🕐 <b>Fetched:</b> ${new Date(data.fetchedAt).toLocaleTimeString()}
    </div>
  `;
  feed.insertBefore(card, feed.firstChild);

  // Also update the stats counters
  const total = document.getElementById('auth0-total');
  if (total) total.textContent = data.totalUsers;
}

// ============================================================
// Public Controls
// ============================================================
window.assignTask = function () {
  const input = document.getElementById('task-input');
  const task = input.value.trim();
  if (!task) return;

  // Check for command patterns first
  for (const cmd of COMMAND_PATTERNS) {
    if (cmd.pattern.test(task)) {
      addLog('SYSTEM', `Command detected: "${task}"`, 'action');
      input.value = '';
      cmd.handler();
      return;
    }
  }

  // Normal task distribution
  addLog('SYSTEM', `New task assigned: "${task}"`, 'action');
  updateMetrics('tasks');

  AGENTS.forEach((agent, i) => {
    setTimeout(() => {
      agent.currentTask = task;
      updateAgentCard(agent);
      const msg = getAgentMessage(agent, task);
      sendToChat(`${agent.avatar} ${agent.name}`, msg);
      agentLearn(agent, `task: ${task}`);
      if (window.Room3D) window.Room3D.setWorking(agent.id, `TASK:\n${task}`);
    }, i * 1200);
  });

  input.value = '';
};

window.triggerLearning = function () {
  AGENTS.forEach(agent => {
    const fact = `cycle-${metrics.cycles}-optimization-${agent.role}`;
    agentLearn(agent, fact);
    addLog(agent.name, `Forced learning: score=${agent.learningScore}`, 'learn');
  });
  sendToChat('🧠 Echo', `Learning cycle complete. All agents updated. Cycle #${metrics.cycles}`);
};

window.fetchRealData = async function () {
  addLog('SYSTEM', 'Fetching live data...', 'data');
  const data = await fetchLiveData();
  if (data) {
    const agent = AGENTS[0];
    agentLearn(agent, data.summary);
    sendToChat(`${agent.avatar} ${agent.name}`, `📡 Live data: ${data.summary}`);
    updateMetrics('data');
  }
};

window.resetAgents = function () {
  AGENTS.forEach(agent => {
    agent.memory = [];
    agent.learningScore = 0;
    agent.memoryCapacity = 0.1;
    agent.currentTask = 'Restarting...';
    updateAgentCard(agent);
  });
  metrics = { cycles: 0, tasks: 0, learns: 0, data: 0 };
  ['cycles', 'tasks', 'learns', 'data'].forEach(k => {
    document.getElementById(`m-${k}`).textContent = '0';
  });
  conversationHistory = [];
  document.getElementById('log-container').innerHTML = '';
  addLog('SYSTEM', 'All agents reset.', 'action');
};

// ============================================================
// Boot
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  renderAgents();

  AGENTS.forEach((agent, i) => {
    setTimeout(() => {
      sendToChat(`${agent.avatar} ${agent.name}`, `Online. I'm ${agent.name}, ${agent.role}. Ready to operate.`);
      agentLearn(agent, 'boot-sequence');
    }, 1000 + i * 800);
  });

  function scheduleNext() {
    const delay = 4000 + Math.random() * 4000;
    setTimeout(async () => {
      await autonomousLoop();
      scheduleNext();
    }, delay);
  }

  setTimeout(scheduleNext, 5000);
});
