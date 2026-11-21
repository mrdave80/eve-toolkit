'use strict';
/* Kills in your chain: every few minutes, ask zKillboard for kills in each system of the wormhole maps
   you've used in the last two days, and raise an alert for new ones. Wormhole space has no local, so a
   kill a few holes away is often the first sign someone is rolling through. */
const store = require('./store');
const ws = require('./workspace');
const sde = require('./sde');
const { zk } = require('./zkill');
const { get, safe, ok } = require('./esi');

const seen = new Set();
let primed = false;
let recent = [];      // last two hours of kills found
let notify = () => {}, send = () => {};

function activeSystems() {
  const cut = Date.now() - 2 * 86400000;
  const out = new Map();
  for (const m of ws.get().maps || []) {
    const conns = m.connections || [];
    const fresh = conns.some(c => Date.parse(c.updatedAt || c.createdAt || 0) > cut) || Date.parse(m.updatedAt || 0) > cut;
    if (!fresh) continue;
    for (const s of m.systems || []) if (s.id && !out.has(s.id)) out.set(s.id, { mapId: m.id, map: m.name || 'Map', name: s.name || (sde.ready() && sde.system(s.id) || {}).name || String(s.id) });
  }
  return [...out.entries()].slice(0, 30);
}

async function check() {
  if (store.get().settings.whChainKills === false) return recent;
  const systems = activeSystems();
  const found = [];
  for (const [id, info] of systems) {
    const list = await zk(`/kills/solarSystemID/${id}/pastSeconds/3600/`, 240000).catch(() => null);
    for (const k of Array.isArray(list) ? list : []) {
      if (seen.has(k.killmail_id)) continue;
      seen.add(k.killmail_id);
      if (!primed) continue;        // first pass after start: remember, don't alert about old kills
      const km = await safe(() => get(`/killmails/${k.killmail_id}/${k.zkb && k.zkb.hash}/`));
      const v = ok(km) ? km.victim || {} : {};
      const ship = v.ship_type_id && sde.ready() ? (sde.type(v.ship_type_id) || {}).name : null;
      const players = ok(km) ? (km.attackers || []).filter(a => a.character_id).length : 0;
      const e = { killId: k.killmail_id, systemId: id, system: info.name, map: info.map, mapId: info.mapId, ship, shipTypeId: v.ship_type_id || null, value: (k.zkb && k.zkb.totalValue) || 0, npc: !!(k.zkb && k.zkb.npc), attackers: players, at: ok(km) ? km.killmail_time : new Date().toISOString() };
      found.push(e);
    }
  }
  primed = true;
  if (seen.size > 5000) { const keep = [...seen].slice(-2000); seen.clear(); keep.forEach(x => seen.add(x)); }
  const cut = Date.now() - 2 * 3600000;
  recent = [...found, ...recent].filter(x => Date.parse(x.at) > cut).slice(0, 100);
  for (const e of found.filter(x => !x.npc)) {
    const isk = e.value >= 1e9 ? (e.value / 1e9).toFixed(1) + 'b' : Math.round(e.value / 1e6) + 'm';
    notify(`Kill in your chain: ${e.system}`, `${e.ship || 'A ship'} lost (${isk} ISK)${e.attackers ? `, ${e.attackers} attacker${e.attackers === 1 ? '' : 's'}` : ''} · ${e.map}`, 'wormhole', 0);
  }
  if (found.length) send(found);
  return recent;
}

module.exports = { check, recent: () => recent, activeSystems, setNotifier: (n, s) => { notify = n; send = s; }, _reset: () => { seen.clear(); primed = false; recent = []; } };
