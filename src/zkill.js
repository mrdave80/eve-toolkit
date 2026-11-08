'use strict';
/* Shared zKillboard client: one queue for the whole app so we stay near one request a second. */
const ZK = 'https://zkillboard.com/api';
const UA = 'EVE-Toolkit-Desktop (in-game contact: Mr Frank)';
let last = 0;
const cache = new Map();
async function zk(path, ttlMs = 0) {
  const hit = ttlMs && cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const wait = Math.max(0, last + 1100 - Date.now());
  last = Date.now() + wait;
  if (wait) await new Promise(r => setTimeout(r, wait));
  const r = await fetch(ZK + path, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip', Accept: 'application/json' } });
  if (r.status === 429) { require('./diag').warn('zkill', '429 rate limited ' + path); throw new Error('zKillboard is rate-limiting requests. Try again in a minute.'); }
  if (!r.ok) { require('./diag').warn('zkill', r.status + ' ' + path); throw new Error(`zKillboard returned ${r.status}`); }
  const t = await r.text();
  let data = null; try { data = JSON.parse(t); } catch { /* not JSON */ }
  if (ttlMs) cache.set(path, { at: Date.now(), data });
  return data;
}
module.exports = { zk, UA };
