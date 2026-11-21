'use strict';
/* Exploration loot tracker: paste what each relic or data site gave you, see ISK per site, per site type and per hour.
 * Kept on this PC in store.exploreLog. A "run" is a stretch of sites; ISK per hour runs from its start to its last site. */

const store = require('./store');

const TYPES = ['relic', 'data', 'ghost', 'sleeper', 'combat', 'other'];
const LABEL = { relic: 'Relic', data: 'Data', ghost: 'Ghost site', sleeper: 'Sleeper cache', combat: 'Combat / DED', other: 'Other' };
const MAX_SITES = 3000;

function log() {
  const d = store.get();
  if (!d.exploreLog || typeof d.exploreLog !== 'object') d.exploreLog = { runs: [], sites: [], price: 'buy' };
  const l = d.exploreLog;
  if (!Array.isArray(l.runs)) l.runs = [];
  if (!Array.isArray(l.sites)) l.sites = [];
  return l;
}
const save = () => store.save('exploreLog');
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const openRun = l => l.runs.find(r => !r.end) || null;

/** Guess the site type from the site name (the probe scanner name, e.g. "Ruined Sansha Temple Site"). */
function guessType(name) {
  const n = String(name || '').toLowerCase();
  if (/ruined|crumbling|decayed|forgotten|unsecured.*(frontier|perimeter|core)|relic/.test(n) && !/data/.test(n)) return 'relic';
  if (/abandoned research|central .* (sparking|survey|command)|local .* (backup|shattered|minor)|regional .* (data|mainframe|command)|data/.test(n)) return 'data';
  if (/covert research|ghost/.test(n)) return 'ghost';
  if (/sleeper cache|limited|standard|superior/.test(n)) return 'sleeper';
  if (/\b\d\/10\b|dead|hideaway|refuge|den|rally point|hidden|forlorn|forsaken/.test(n)) return 'combat';
  return null;
}

function startRun(name) {
  const l = log();
  const cur = openRun(l);
  if (cur) cur.end = Date.now();
  const r = { id: id(), name: String(name || '').trim().slice(0, 60) || null, start: Date.now(), end: null };
  l.runs.unshift(r); l.runs = l.runs.slice(0, 300);
  save();
  return summary();
}
function stopRun() {
  const l = log(); const cur = openRun(l);
  if (cur) { const last = l.sites.filter(s => s.run === cur.id).reduce((m, s) => Math.max(m, s.at), cur.start); cur.end = Math.max(last, Math.min(Date.now(), last + 30 * 60000)); save(); }
  return summary();
}

/** Add a site: paste the loot (cargo or inventory copy), we price it and file it under the open run (starting one if needed). */
async function addSite({ text, type, name, system, hub = 'Jita' } = {}, overrides = {}) {
  const appraise = require('./appraise');
  const a = await appraise.appraise(String(text || ''), hub, overrides);
  if (!a.rows.length) throw new Error('Paste the loot from your cargo hold: select the items, Ctrl+C, then paste here.');
  const l = log();
  let run = openRun(l);
  if (!run) { startRun(); run = openRun(l); }
  const t = TYPES.includes(type) ? type : (guessType(name) || 'other');
  const site = {
    id: id(), run: run.id, at: Date.now(), type: t, name: String(name || '').trim().slice(0, 60) || null, system: String(system || '').trim().slice(0, 40) || null,
    buy: Math.round(a.totals.buy), sell: Math.round(a.totals.sell), volume: Math.round(a.totals.volume * 100) / 100,
    items: a.rows.slice(0, 60).map(r => ({ typeId: r.typeId, name: r.name, qty: r.qty, buy: Math.round(r.buy), sell: Math.round(r.sell) }))
  };
  l.sites.unshift(site); l.sites = l.sites.slice(0, MAX_SITES);
  save();
  return { site, unknown: a.unknown, ...summary() };
}
function removeSite(siteId) { const l = log(); l.sites = l.sites.filter(s => s.id !== siteId); save(); return summary(); }
function setPrice(p) { const l = log(); l.price = p === 'sell' ? 'sell' : 'buy'; save(); return summary(); }
function clear() { const d = store.get(); d.exploreLog = { runs: [], sites: [], price: (d.exploreLog || {}).price || 'buy' }; save(); return summary(); }

/** Totals: per run (with ISK per hour), per site type, and the best sites. */
function summary(now = Date.now()) {
  const l = log();
  const val = s => (l.price === 'sell' ? s.sell : s.buy) || 0;
  const runs = l.runs.map(r => {
    const sites = l.sites.filter(s => s.run === r.id);
    const isk = sites.reduce((n, s) => n + val(s), 0);
    // Run start to its end (or now while open), at least 10 minutes so one quick site doesn't read as billions an hour.
    const ms = Math.max(10 * 60000, (r.end || now) - r.start);
    return { ...r, open: !r.end, sites: sites.length, isk, ms, perHour: sites.length ? isk / (ms / 3600000) : 0, perSite: sites.length ? isk / sites.length : 0 };
  });
  const byType = TYPES.map(t => { const s = l.sites.filter(x => x.type === t); const isk = s.reduce((n, x) => n + val(x), 0); return { type: t, label: LABEL[t], sites: s.length, isk, perSite: s.length ? isk / s.length : 0, best: s.reduce((m, x) => Math.max(m, val(x)), 0) }; }).filter(x => x.sites);
  const total = l.sites.reduce((n, s) => n + val(s), 0);
  const timed = runs.filter(r => r.sites);
  const hours = timed.reduce((n, r) => n + r.ms, 0) / 3600000;
  // Loot by item across every site: what's actually paying.
  const items = new Map();
  for (const s of l.sites) for (const it of s.items || []) { const e = items.get(it.typeId) || { typeId: it.typeId, name: it.name, qty: 0, isk: 0 }; e.qty += it.qty; e.isk += (l.price === 'sell' ? it.sell : it.buy) || 0; items.set(it.typeId, e); }
  return {
    price: l.price, total, sites: l.sites.length, hours, perHour: hours ? total / hours : 0, perSite: l.sites.length ? total / l.sites.length : 0,
    open: runs.find(r => r.open) || null, runs: runs.slice(0, 40), byType,
    recent: l.sites.slice(0, 60).map(s => ({ ...s, value: val(s) })),
    topItems: [...items.values()].sort((a, b) => b.isk - a.isk).slice(0, 15),
    types: TYPES.map(t => [t, LABEL[t]])
  };
}

module.exports = { summary, addSite, removeSite, startRun, stopRun, setPrice, clear, guessType, TYPES };
