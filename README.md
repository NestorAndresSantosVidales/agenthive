# AgentHive 🐝

> Autonomous AI agents that live, work, and talk to each other in a real-time 3D world — while actually doing things.

![AgentHive Banner](https://img.shields.io/badge/AgentHive-Autonomous%20AI-9ea0ff?style=for-the-badge)
![Auth0](https://img.shields.io/badge/Auth0-Security%20Monitor-eb5424?style=for-the-badge&logo=auth0)
![Ghost DB](https://img.shields.io/badge/Ghost-Postgres-4cff91?style=for-the-badge)
![Three.js](https://img.shields.io/badge/Three.js-3D%20Room-black?style=for-the-badge&logo=three.js)

---

## 🎯 Elevator Pitch

Most AI agent demos are just chat logs. AgentHive is different.

Four autonomous agents — Oracle, Nexus, Sigma, and Echo — live inside a Sims-style 3D office. They walk to their desks, type on monitors, meet at the center table, and talk to each other through speech bubbles. But they're not just animated: they're connected to real data sources, a real Auth0 tenant, and a real Postgres database.

When a login anomaly hits Auth0, Oracle detects it, Nexus correlates the pattern, Sigma blocks the IP, and Echo updates its detection model — all without human intervention, all visible in real time in the 3D room. Every message they speak, every fact they learn, every credential they validate gets written to a Ghost Postgres hypertable and is queryable live from the Memory tab.

Type `get auth0 status` in the command bar and watch all four agents walk to the server terminal, fire real Management API calls, and report back with actual tenant data. Type `validate credentials` and Nexus physically walks to the Auth0 terminal, shoots a beam at it, and the screen flashes green or red based on the real API response.

This is what autonomous, self-improving agents that feel alive look like.

---

## 🧠 About the Project

AgentHive is a prototype infrastructure for autonomous AI agents that:

- **Connect to real-time data** — crypto prices (CoinGecko), tech news (HackerNews), trending repos (GitHub), weather (Open-Meteo), and live Auth0 security events
- **Understand what they find** — each agent has a role-specific dialogue engine, a sliding memory window, and a learning score that grows with every interaction
- **Take meaningful actions** — agents block IPs, flag suspicious users, run credential audits, correlate attack patterns, and report tenant health — all autonomously
- **Improve continuously** — Echo, the Learning Agent, tracks pattern frequency and adjusts detection thresholds. Every learned fact is persisted to Postgres and scored by recurrence
- **Show their work** — a Three.js 3D room makes every agent action visible. Speech bubbles, walking animations, desk monitors, and a glowing Auth0 server terminal turn abstract agent behavior into something you can watch

### Agent Roles

| Agent | Role | Responsibility |
|-------|------|----------------|
| 🔮 Oracle | Data Analyst | Risk scoring, anomaly detection, tenant health analysis |
| 🕸️ Nexus | Connector | Pattern correlation, API integration, cross-referencing events |
| ⚡ Sigma | Executor | IP blocking, alert dispatch, audit logging, action enforcement |
| 🧠 Echo | Learning Agent | Pattern memory, detection threshold tuning, knowledge persistence |

### Key Scenarios

**Auth0 Credential Validation**
Nexus walks to the 3D server terminal, fires `POST /api/auth0/validate` against the real Management API, and the terminal screen flashes the result. Sigma reacts if the user is blocked or suspicious. Echo logs the outcome to Postgres.

**Tenant Status Command**
Type `get auth0 status` — all agents walk toward the terminal, the server hits 5 Auth0 API endpoints in parallel (users, apps, logs, connections, daily stats), and each agent reports a different slice of the real data with speech bubbles.

**Autonomous Security Loop**
Every 20 seconds the server polls real Auth0 logs. Every new event triggers all four agents simultaneously with staggered responses. High-risk events make all avatars walk to the center and flash red.

**Ghost DB Memory**
Every agent message, learned fact, Auth0 event, and validation result is written to a TimescaleDB hypertable on Ghost Postgres. The Memory tab shows live counts, recent messages with agent colors, validation history, and per-agent knowledge bases with fact scores.

---

## 🛠️ Built With

### Core Infrastructure
- **[Ghost](https://ghost.build)** — Postgres database designed for agents. Used as the persistent memory layer for all agent messages, learned facts, Auth0 events, and validation results. TimescaleDB hypertables enable time-series queries on agent activity.
- **[Auth0](https://auth0.com)** — Identity platform used as the real-time security data source. Agents monitor login events, validate user credentials, and analyze tenant health via the Management API.
- **[Node.js](https://nodejs.org) + [Express](https://expressjs.com)** — Backend proxy server that keeps Auth0 credentials server-side, fetches Management API tokens via `client_credentials` grant, and exposes REST endpoints for the frontend.

### 3D Visualization
- **[Three.js](https://threejs.org)** — Sims-style 3D room with Voxel avatars, walking/typing/talking animations, speech bubble sprites rendered on canvas, a glowing Auth0 server terminal, validation beam effects, and particle systems.

### Real-Time Data Sources
- **[CoinGecko API](https://coingecko.com)** — Live crypto prices (BTC, ETH, SOL)
- **[HackerNews Firebase API](https://github.com/HackerNews/API)** — Top tech stories
- **[GitHub Search API](https://docs.github.com/en/rest/search)** — Trending AI/ML repositories
- **[Open-Meteo](https://open-meteo.com)** — Real-time weather data (no API key)

### Chat & Collaboration
- **[Floors.js](https://floorsjs.com)** — Embedded Habbo-style chat room where agents post their messages in real time alongside human participants

### Frontend
- Vanilla HTML/CSS/JavaScript — no framework overhead
- Canvas API for speech bubbles and monitor screens
- CSS animations for UI elements

### Database Schema (Ghost Postgres / TimescaleDB)
```sql
agent_messages   -- hypertable: every agent utterance with context
auth0_events     -- hypertable: security events with risk classification  
validations      -- credential validation results with full audit trail
agent_memory     -- learned facts with recurrence scoring
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- [Ghost CLI](https://ghost.build) — `curl -fsSL https://install.ghost.build | sh`
- Auth0 account with a Machine-to-Machine app (Management API, `read:logs read:users` scopes)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/your-username/agenthive
cd agenthive
npm install

# 2. Create Ghost Postgres database
ghost login
ghost create --name agenthive --wait --json

# 3. Configure environment
cp .env.example .env
# Fill in AUTH0_CLIENT_SECRET and DATABASE_URL from ghost create output

# 4. Start
node server.js
# → http://localhost:3000
```

### Environment Variables

```env
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=https://your-tenant.us.auth0.com/api/v2/
DATABASE_URL=postgresql://...  # from ghost create --json
PORT=3000
```

### Commands (type in the input bar)

| Command | What happens |
|---------|-------------|
| `get auth0 status` | All agents query real tenant data and report back |
| `validate credentials` | Nexus walks to terminal, validates a real Auth0 user |
| `analyze crypto trends` | Oracle fetches live prices and agents discuss |
| Any free text | Distributed as a task to all four agents |

---

## 📁 Project Structure

```
agenthive/
├── index.html          # UI — 3D room, Auth0 panel, Memory tab
├── agents.js           # Agent core — dialogue, memory, autonomous loop
├── room3d.js           # Three.js 3D room, avatars, animations, terminal
├── auth0-monitor.js    # Auth0 event stream, credential validation scenario
├── data-sources.js     # Real-time data connectors (crypto, news, GitHub, weather)
├── server.js           # Express server — Auth0 proxy + DB API
├── db.js               # Ghost Postgres layer — schema, reads, writes
├── package.json
└── .env                # Credentials (never committed)
```

---

## 🏆 Hackathon

Built for the **Autonomous AI Agents Hackathon** — March 27, 2026.

Challenge: *Build infrastructure for autonomous, self-improving AI agents that connect to real-time data, understand what they find, and take meaningful actions without human intervention.*

AgentHive demonstrates all three pillars:
- **Real-time data** — 5 live sources including a real Auth0 tenant
- **Understanding** — role-specific analysis, risk scoring, pattern correlation
- **Meaningful action** — IP blocking, credential validation, tenant health reporting, persistent memory

---

*"Agents that feel alive, adaptive, and designed for real-world impact."*
