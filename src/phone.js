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
  attack: 'Under attack (from the combat log)',
  app: 'App updates'
};
const DEFAULTS = { enabled: false, ntfy: '', webhook: '', onlyAway: true, digest: false, digestAt: '08:00', digestLast: null, categories: { skills: true, industry: true, planets: true, intel: true, structures: true, ops: true, daily: true, prices: true } };
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
  if (typeof c.digest === 'boolean') next.digest = c.digest;
  if (typeof c.digestAt === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.digestAt)) next.digestAt = c.digestAt;
  if (c.categories && typeof c.categories === 'object') next.categories = Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, c.categories[k] === undefined ? !!cur.categories[k] : !!c.categories[k]]));
  validate(next);
  store.get().settings.phone = next; store.save();
  return next;
}

/** The once-a-day digest: what needs attention across every pilot, sent at the chosen local time. */
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function digestDue(now = new Date()) {
  const c = cfg();
  if (!c.enabled || !c.digest || (!c.ntfy && !c.webhook)) return false;
  const [h, m] = String(c.digestAt || '08:00').split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return false;
  return c.digestLast !== localDay(now);
}
function digestText(att, extra = {}) {
  const items = (att && att.items) || [];
  const lines = items.slice(0, 15).map(i => `${i.level === 'red' ? '🔴' : i.level === 'gold' ? '🟡' : '🔵'} ${i.text}`);
  if (items.length > 15) lines.push(`…and ${items.length - 15} more`);
  const head = [extra.pilots ? `${extra.pilots} pilot${extra.pilots === 1 ? '' : 's'}` : null, extra.training !== undefined ? `${extra.training} training` : null, extra.wallet ? `${extra.wallet} ISK in wallets` : null].filter(Boolean).join(' · ');
  return { title: items.length ? `EVE Toolkit: ${items.length} thing${items.length === 1 ? '' : 's'} need you` : 'EVE Toolkit: all good', body: [head, ...(lines.length ? lines : ['Nothing needs you today: queues are running and nothing is out of fuel.'])].filter(Boolean).join('\n') };
}
async function sendDigest(att, extra, { force = false } = {}) {
  const c = cfg();
  if (!force && !digestDue()) return false;
  if (!c.ntfy && !c.webhook) throw new Error('Add an ntfy address or a Discord webhook first.');
  const { title, body } = digestText(att, extra);
  // Mark first, so a failing network doesn't send it every minute.
  if (!force) { store.get().settings.phone = { ...c, digestLast: localDay() }; store.save(); }
  await deliver(c, title, body, 'calendar');
  return true;
}

module.exports = { digestDue, digestText, sendDigest, forward, test, save, cfg, CATEGORIES, setAwayCheck: fn => { isAway = fn; } };
