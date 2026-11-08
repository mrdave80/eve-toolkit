'use strict';
/* Daily reset helper: Daily Goals reminders, monthly track counter, EVE news watcher for login
   campaigns and SP events, and Tranquility up / long downtime alerts.
   ESI has no endpoint for login rewards or Daily Goals, so "done today" is ticked by the user. */
const store = require('./store');
const esi = require('./esi');
const diag = require('./diag');

const RESET_H = 11;               // daily downtime, 11:00 EVE time (UTC)
const MONTH_STEPS = 12;           // steps on the Daily Goals monthly track
const NEWS_URL = 'https://www.eveonline.com/rss/news';
const NEWS_EVERY = 30 * 60000;
const UA = 'EVE-Toolkit-Desktop (in-game contact: Mr Frank)';

const DEFAULTS = { enabled: true, resetAlert: true, reminder: true, reminderHours: 3, monthly: true, tqUp: true, longDowntime: true,
  news: true, newsKinds: { login: true, sp: true, free: true, sale: false, event: true } };

const cfg = () => { const s = store.get().settings.daily || {}; return { ...DEFAULTS, ...s, newsKinds: { ...DEFAULTS.newsKinds, ...(s.newsKinds || {}) } }; };
function state() {
  const d = store.get();
  d.daily = d.daily || {};
  const s = d.daily;
  s.done = s.done || {};        // charId -> [dayKey, ...]
  s.track = s.track || {};      // charId -> false to stop tracking a pilot
  s.alerted = s.alerted || {};  // kind -> dayKey last sent
  s.news = s.news || { seen: [], items: [], at: 0 };
  s.tq = s.tq || { online: null, since: 0, checked: 0, players: 0 };
  return s;
}

// ---- EVE days: a day runs from one downtime to the next ----
const dayKey = (t = Date.now()) => new Date(t - RESET_H * 3600000).toISOString().slice(0, 10);
const monthKey = (t = Date.now()) => dayKey(t).slice(0, 7);
function nextReset(t = Date.now()) {
  const d = new Date(t); const r = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESET_H);
  return r > t ? r : r + 86400000;
}
function daysLeftInMonth(t = Date.now()) {
  // EVE days still to come in this month, counting today.
  const k = dayKey(t); const [y, m, dd] = k.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - dd + 1;
}

function pilotRows() {
  const d = store.get(); const s = state(); const today = dayKey(); const mk = monthKey();
  return (d.characters || []).map(c => {
    const done = s.done[c.id] || [];
    const steps = Math.min(MONTH_STEPS, done.filter(k => k.startsWith(mk)).length);
    const doneToday = done.includes(today);
    const left = MONTH_STEPS - steps; const daysLeft = daysLeftInMonth();
    const avail = daysLeft - (doneToday ? 1 : 0);   // days still open to tick, after today if today is done
    return { id: c.id, name: c.name, track: s.track[c.id] !== false, doneToday, steps, stepsLeft: left, daysLeft,
      atRisk: left > 0 && avail < left + 2, impossible: left > avail };
  });
}

function setDone(charId, done, day = dayKey()) {
  const s = state(); const id = String(Number(charId));
  const list = new Set(s.done[id] || []);
  if (done) list.add(day); else list.delete(day);
  // keep about two months
  const cutoff = dayKey(Date.now() - 70 * 86400000);
  s.done[id] = [...list].filter(k => k >= cutoff).sort();
  store.save('daily');
  return true;
}
function setAllDone(done) { for (const c of store.get().characters || []) if (state().track[c.id] !== false) setDone(c.id, done); return true; }
function setTrack(charId, on) { const s = state(); if (on) delete s.track[Number(charId)]; else s.track[Number(charId)] = false; store.save('daily'); return true; }

// ---- News ----
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();
const tag = (x, name) => { const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(x); return m ? m[1] : ''; };

function parseRss(xml) {
  return [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m => {
    const x = m[1];
    const link = decode(tag(x, 'link')) || (/<link[^>]*href="([^"]+)"/i.exec(x) || [])[1] || '';
    const pub = Date.parse(decode(tag(x, 'pubDate')) || decode(tag(x, 'published')) || decode(tag(x, 'updated'))) || 0;
    return { id: decode(tag(x, 'guid')) || link, title: decode(tag(x, 'title')), link, pub, text: decode(tag(x, 'description')).slice(0, 600) };
  }).filter(i => i.title);
}

function classify(item) {
  const t = item.title + ' ' + item.text;
  const kinds = [];
  if (/log ?in (daily|every day|each day|rewards?|to claim)|login (rewards?|campaign|event|gifts?)|daily (login|rewards?)|claim your (free )?(gifts|rewards)/i.test(t)) kinds.push('login');
  if (/skill ?points?|\bSP\b|double training|bonus skill|cerebral accelerator/i.test(t)) kinds.push('sp');
  if (/\bfree\b/i.test(t)) kinds.push('free');
  if (/\bsale\b|discount|% off|\boffers?\b|\bbundle\b/i.test(t)) kinds.push('sale');
  if (/\bevents?\b|celebrat|festival|gala|harvest|capsuleer day|nexus|anniversary/i.test(t)) kinds.push('event');
  return kinds;
}

function endDate(item) {
  const t = item.title + ' ' + item.text;
  const mon = MONTHS.join('|');
  let m = new RegExp(`(?:until|ends?|runs? until|through|before)\\s+(?:(\\d{1,2}):(\\d{2})\\s*(?:UTC|EVE time)?\\s+on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${mon})(?:\\s+(\\d{4}))?`, 'i').exec(t);
  let day, mi, year, hh = RESET_H, mm = 0;
  if (m) { if (m[1]) { hh = +m[1]; mm = +m[2]; } day = +m[3]; mi = MONTHS.indexOf(m[4].toLowerCase()); year = m[5] ? +m[5] : null; }
  else if ((m = new RegExp(`(?:until|ends?|runs? until|through|before)\\s+(${mon})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'i').exec(t))) { mi = MONTHS.indexOf(m[1].toLowerCase()); day = +m[2]; year = m[3] ? +m[3] : null; }
  else return null;
  const base = item.pub || Date.now();
  if (!year) year = new Date(base).getUTCFullYear();
  let at = Date.UTC(year, mi, day, hh, mm);
  if (at < base - 86400000) at = Date.UTC(year + 1, mi, day, hh, mm);
  return at;
}

function newsItems() {
  const now = Date.now();
  return (state().news.items || []).map(i => {
    const active = i.kinds.length && (i.endsAt ? i.endsAt > now : now - i.pub < 14 * 86400000);
    return { ...i, active };
  }).sort((a, b) => b.pub - a.pub);
}
const activeLogin = () => newsItems().filter(i => i.active && i.kinds.includes('login'));

async function fetchNews(force = false) {
  const s = state();
  if (!force && Date.now() - (s.news.at || 0) < NEWS_EVERY - 5000) return { items: newsItems(), fresh: [] };
  const res = await fetch(NEWS_URL, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!res.ok) throw new Error(`EVE news feed returned ${res.status}`);
  const items = parseRss(await res.text()).slice(0, 30).map(i => ({ ...i, kinds: classify(i), endsAt: endDate(i) }));
  const firstRun = !s.news.at;
  const seen = new Set(s.news.seen);
  const fresh = firstRun ? [] : items.filter(i => !seen.has(i.id));
  s.news = { at: Date.now(), seen: [...new Set([...items.map(i => i.id), ...s.news.seen])].slice(0, 200), items };
  store.save('daily');
  return { items: newsItems(), fresh };
}

// ---- Tranquility ----
async function checkTq() {
  const s = state();
  let online = false, players = 0;
  try { const st = await esi.serverStatus(); players = st.players || 0; online = players > 0 && !st.vip; }
  catch { online = false; }
  const prev = s.tq.online;
  if (prev !== online) s.tq.since = Date.now();
  s.tq = { ...s.tq, online, players, checked: Date.now() };
  return { online, prev, players };
}

// ---- Tick: called every minute from main ----
let busy = false;
async function tick(notify) {
  const c = cfg();
  if (!c.enabled || busy) return;
  busy = true;
  try {
    const s = state(); const now = Date.now(); const today = dayKey(now);
    const minsSinceReset = (now - (nextReset(now) - 86400000)) / 60000;
    const minsToReset = (nextReset(now) - now) / 60000;
    const nearDt = minsToReset <= 5 || minsSinceReset <= 120;
    // Check TQ every minute around downtime, else every 10 minutes.
    if (nearDt || now - (s.tq.checked || 0) > 10 * 60000) {
      const { online, prev, players } = await checkTq();
      const login = activeLogin();
      const extra = login.length ? ` Login campaign on: ${login[0].title}.` : '';
      if (online && prev === false && minsSinceReset < 240 && c.tqUp && s.alerted.tqUp !== today) {
        s.alerted.tqUp = today; if (c.resetAlert) s.alerted.reset = today;
        notify('Tranquility is up', `${players.toLocaleString()} pilots online. Daily goals have reset.${extra}`, 'daily');
      }
      if (!online && c.longDowntime && minsSinceReset >= 25 && minsSinceReset < 600 && s.alerted.longDt !== today && s.tq.since && s.tq.since < now - 20 * 60000) {
        s.alerted.longDt = today;
        notify('Downtime is running long', `Tranquility has been offline since ${new Date(s.tq.since).toISOString().slice(11, 16)} EVE time.`, 'daily');
      }
      if (c.resetAlert && online && minsSinceReset >= 5 && minsSinceReset < 240 && s.alerted.reset !== today) {
        s.alerted.reset = today;
        notify('Daily reset', `Daily goals have reset.${extra}`, 'daily');
      }
    }
    // Reminder before the next reset, plus the monthly track warning.
    const hoursToReset = (nextReset(now) - now) / 3600000;
    if (hoursToReset <= c.reminderHours && s.alerted.remind !== today) {
      s.alerted.remind = today;
      const rows = pilotRows().filter(r => r.track);
      const todo = c.reminder ? rows.filter(r => !r.doneToday) : [];
      const risk = c.monthly ? rows.filter(r => r.atRisk) : [];
      const login = activeLogin();
      if (todo.length) {
        const names = todo.slice(0, 3).map(r => r.name).join(', ') + (todo.length > 3 ? ` and ${todo.length - 3} more` : '');
        notify('Daily goals not ticked', `${names}: ${Math.round(hoursToReset * 10) / 10} h until reset.${login.length ? ' Claim the login reward too.' : ''}`, 'daily');
      }
      if (risk.length) notify('Monthly track at risk', risk.slice(0, 3).map(r => `${r.name} needs ${r.stepsLeft} more day${r.stepsLeft === 1 ? '' : 's'}, ${r.daysLeft} left`).join('; '), 'daily');
    }
    // News every 30 minutes.
    if (c.news) {
      try {
        const { fresh } = await fetchNews();
        for (const i of fresh) {
          const kinds = i.kinds.filter(k => c.newsKinds[k]);
          if (!kinds.length) continue;
          const label = kinds.includes('login') ? 'Login rewards' : kinds.includes('sp') ? 'Skill points' : kinds.includes('free') ? 'Free stuff' : kinds.includes('event') ? 'Event' : 'Offer';
          notify(`EVE news: ${label}`, i.title + (i.endsAt ? ` (until ${new Date(i.endsAt).toUTCString().slice(5, 16)})` : ''), 'daily');
        }
      } catch (e) { diag.warn('daily', 'news: ' + e.message); }
    }
    store.save('daily');
  } catch (e) { diag.error('daily', e); }
  finally { busy = false; }
}

function status() {
  const s = state();
  return { cfg: cfg(), day: dayKey(), nextReset: nextReset(), monthSteps: MONTH_STEPS, daysLeft: daysLeftInMonth(), pilots: pilotRows(),
    news: newsItems(), newsAt: s.news.at || 0, tq: s.tq };
}

function save(next) {
  const cur = cfg(); const d = store.get();
  const out = { ...cur };
  for (const k of ['enabled', 'resetAlert', 'reminder', 'monthly', 'tqUp', 'longDowntime', 'news']) if (typeof next[k] === 'boolean') out[k] = next[k];
  if (next.reminderHours !== undefined) out.reminderHours = Math.max(0.5, Math.min(12, Number(next.reminderHours) || 3));
  if (next.newsKinds && typeof next.newsKinds === 'object') for (const k of Object.keys(DEFAULTS.newsKinds)) if (typeof next.newsKinds[k] === 'boolean') out.newsKinds[k] = next.newsKinds[k];
  d.settings.daily = out; store.save('daily');
  return out;
}

module.exports = { tick, status, save, setDone, setAllDone, setTrack, fetchNews, _t: { dayKey, monthKey, nextReset, daysLeftInMonth, parseRss, classify, endDate } };
