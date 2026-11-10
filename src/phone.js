'use strict';
/* Phone alerts: forward chosen notifications to ntfy (push app) and/or a Discord webhook. */
const store = require('./store');

const CATEGORIES = {
  skills: 'Skill queue empty, paused or ending',
  industry: 'Industry jobs finished or slots idle',
  planets: 'PI extractors stopping',
  market: 'Orders, undercuts and contracts',
  prices: 'Price alerts from your watchlist',
  intel: 'Intel threats, Local threats and kill spikes',
  structures: 'Corp structure attacks and fuel',
  ops: 'Ops and timers starting soon',
  wormhole: 'New wormhole connections mapped',
  corp: 'Wars and corp applications',
  timers: 'Jump clone ready, jump fatigue cleared, incursions nearby',
  daily: 'Daily reset, login rewards, EVE news and server status',
  app: 'App updates'
};
const DEFAULTS = { enabled: false, ntfy: '', webhook: '', onlyAway: true, categories: { skills: true, industry: true, planets: true, intel: true, structures: true, ops: true, daily: true, prices: true } };
const cfg = () => { const s = store.get().settings.phone || {}; return { ...DEFAULTS, ...s, categories: { ...DEFAULTS.categories, ...(s.categories || {}) } }; };

const recent = new Map();
let sentThisHour = [];
let isAway = () => true;

function validate(c) {
  if (c.ntfy && !/^https:\/\/[^\s/]+\/[A-Za-z0-9_-]{3,64}$/.test(c.ntfy)) throw new Error('The ntfy address should look like https://ntfy.sh/your-topic-name');
  if (c.webhook && !/^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(c.webhook)) throw new Error('That is not a Discord webhook URL (https://discord.com/api/webhooks/…).');
}

async function deliver(c, title, body, tags) {
  const jobs = [];
  if (c.ntfy) {
    const u = new URL(c.ntfy);
    jobs.push(fetch(u.origin + '/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'EVE-Toolkit-Desktop' },
      body: JSON.stringify({ topic: u.pathname.slice(1), title, message: body, tags: (tags || 'rocket').split(',') }) }).then(r => { if (!r.ok) throw new Error('ntfy returned ' + r.status); }));
  }
  if (c.webhook) jobs.push(fetch(c.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'EVE-Toolkit-Desktop' }, body: JSON.stringify({ username: 'EVE Toolkit', content: `**${title}**\n${body}`.slice(0, 1900), allowed_mentions: { parse: [] } }) }).then(r => { if (!r.ok) throw new Error('Discord returned ' + r.status); }));
  const res = await Promise.allSettled(jobs);
  const fail = res.find(r => r.status === 'rejected');
  if (fail) throw fail.reason;
}

/** Called for every desktop notification. Never throws. */
function forward(category, title, body) {
  const c = cfg();
  if (!c.enabled || (!c.ntfy && !c.webhook) || !c.categories[category]) return;
  if (c.onlyAway && !isAway()) return;
  const key = title + '|' + body;
  if (Date.now() - (recent.get(key) || 0) < 10 * 60000) return;
  recent.set(key, Date.now());
  sentThisHour = sentThisHour.filter(t => Date.now() - t < 3600000);
  if (sentThisHour.length >= 30) return; // flood guard
  sentThisHour.push(Date.now());
  deliver(c, title, body, category === 'intel' ? 'warning,skull' : category === 'structures' ? 'warning' : 'rocket').catch(() => {});
}

async function test(c) {
  const merged = { ...cfg(), ...c };
  validate(merged);
  if (!merged.ntfy && !merged.webhook) throw new Error('Add an ntfy address or a Discord webhook first.');
  await deliver(merged, 'EVE Toolkit test', 'Phone alerts are working. o7');
  return true;
}

function save(c) {
  const cur = cfg();
  const next = { ...cur };
  if (typeof c.enabled === 'boolean') next.enabled = c.enabled;
  if (typeof c.onlyAway === 'boolean') next.onlyAway = c.onlyAway;
  if (typeof c.ntfy === 'string') next.ntfy = c.ntfy.trim();
  if (typeof c.webhook === 'string') next.webhook = c.webhook.trim();
  if (c.categories && typeof c.categories === 'object') next.categories = Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, c.categories[k] === undefined ? !!cur.categories[k] : !!c.categories[k]]));
  validate(next);
  store.get().settings.phone = next; store.save();
  return next;
}

module.exports = { forward, test, save, cfg, CATEGORIES, setAwayCheck: fn => { isAway = fn; } };
