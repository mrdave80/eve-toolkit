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

module.exports = { card };
