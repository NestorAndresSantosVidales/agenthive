// ============================================================
// DATA SOURCES — Real-time data connectors
// Sources: CoinGecko, HackerNews, GitHub, Open-Meteo
// All public APIs — no auth required
// ============================================================

const DATA_SOURCES = [
  { name: 'CoinGecko',  source: 'Crypto Markets',  fetch: fetchCrypto      },
  { name: 'HackerNews', source: 'Tech News',        fetch: fetchHackerNews  },
  { name: 'GitHub',     source: 'GitHub Trending',  fetch: fetchGitHub      },
  { name: 'OpenMeteo',  source: 'Weather Data',     fetch: fetchWeather     },
];

// ── Crypto — CoinGecko ───────────────────────────────────────
async function fetchCrypto() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const { bitcoin: btc, ethereum: eth, solana: sol } = data;
    return {
      source: 'CoinGecko',
      summary: `BTC $${btc.usd.toLocaleString()} (${btc.usd_24h_change?.toFixed(2)}%), ETH $${eth.usd.toLocaleString()} (${eth.usd_24h_change?.toFixed(2)}%), SOL $${sol.usd.toLocaleString()}`,
    };
  } catch { return null; }
}

// ── HackerNews — Top stories ─────────────────────────────────
async function fetchHackerNews() {
  try {
    const res = await fetch(
      'https://hacker-news.firebaseio.com/v0/topstories.json?limitToFirst=5&orderBy="$key"',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const ids = await res.json();
    const storyId = ids[Math.floor(Math.random() * Math.min(ids.length, 10))];
    const story = await fetch(`https://hacker-news.firebaseio.com/v0/item/${storyId}.json`);
    const item = await story.json();
    return {
      source: 'HackerNews',
      summary: `"${item.title}" — ${item.score} pts, ${item.descendants || 0} comments`,
    };
  } catch { return null; }
}

// ── GitHub — Trending AI repos ───────────────────────────────
async function fetchGitHub() {
  try {
    const topics = ['ai-agents', 'llm', 'autonomous-agents', 'machine-learning'];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const res = await fetch(
      `https://api.github.com/search/repositories?q=topic:${topic}&sort=stars&order=desc&per_page=3`,
      { headers: { Accept: 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const repo = data.items?.[Math.floor(Math.random() * 3)];
    if (!repo) return null;
    return {
      source: 'GitHub',
      summary: `Trending: ${repo.full_name} ⭐${repo.stargazers_count.toLocaleString()} — ${repo.description?.substring(0, 80) || 'no description'}`,
    };
  } catch { return null; }
}

// ── Open-Meteo — Weather ─────────────────────────────────────
async function fetchWeather() {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=4.71&longitude=-74.07&current=temperature_2m,wind_speed_10m,precipitation&timezone=auto',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const { current: c } = await res.json();
    return {
      source: 'OpenMeteo',
      summary: `Bogotá now: ${c.temperature_2m}°C, wind ${c.wind_speed_10m} km/h, precipitation ${c.precipitation}mm`,
    };
  } catch { return null; }
}

// ── Main dispatcher ───────────────────────────────────────────
window.fetchLiveData = async function () {
  const shuffled = [...DATA_SOURCES].sort(() => Math.random() - 0.5);
  for (const source of shuffled) {
    try {
      const result = await source.fetch();
      if (result) return result;
    } catch { continue; }
  }
  return null;
};
