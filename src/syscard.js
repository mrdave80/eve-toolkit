'use strict';
/* System card: one-stop summary of a solar system for the popup. */
const sde = require('./sde');
const livemap = require('./livemap');
const whinfo = require('./whinfo');
const { resolveNames } = require('./esi');

async function card(q) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const id = typeof q === 'number' || /^\d+$/.test(String(q)) ? Number(q) : sde.systemIdByName(String(q || '').trim());
  const s = id ? sde.system(id) : null;
  if (!s) throw new Error(`Unknown system "${q}".`);
  const wspace = s.regionId >= 11000000;
  const st = await livemap.liveStats(false).catch(() => null);
  const k = st ? st.kills.get(id) || { ship: 0, pod: 0, npc: 0 } : null;
  let sov = null;
  const sovId = st ? st.sov.get(id) : null;
  if (sovId) { const n = await resolveNames([sovId]).catch(() => ({})); sov = { id: sovId, name: n[sovId] || String(sovId) }; }
  const gates = sde.gates(id).map(g => { const x = sde.system(g); return x ? { id: g, name: x.name, security: x.security, region: x.region } : null; }).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    id, name: s.name, security: s.security, region: s.region, regionId: s.regionId, constellation: s.constellation, wspace,
    pochven: s.regionId === 10000070,
    kills: k, jumps: st ? st.jumps.get(id) || 0 : null, statsAt: st ? st.at : null, sov,
    wh: wspace ? whinfo.info(id) : null,
    planets: sde.planetsIn(id), gates
  };
}

/** Kills by day of week and hour from zKillboard, for "when is it busy here". */
async function activity(id) {
  id = Number(id); if (!Number.isInteger(id) || id < 30000000 || id > 33000000) throw new Error('Bad system');
  const { zk } = require('./zkill');
  const st = await zk(`/stats/solarSystemID/${id}/`, 6 * 3600000);
  if (!st || !st.activity) return { activity: null };
  const a = st.activity, grid = [];
  for (let d = 0; d < 7; d++) { const row = a[d] || a[String(d)] || {}; grid.push(Array.from({ length: 24 }, (_, h) => Number(row[h] || row[String(h)] || 0))); }
  return { activity: grid, days: Array.isArray(a.days) && a.days.length === 7 ? a.days : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    kills: st.shipsDestroyed || 0, months: st.months ? Object.keys(st.months).length : null };
}

module.exports = { card, activity };
