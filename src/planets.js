'use strict';
/* Nearby planets for PI: the closest systems with the planet types you want. */
const sde = require('./sde');
const hunting = require('./hunting');

const PI_TYPES = ['Barren', 'Gas', 'Ice', 'Lava', 'Oceanic', 'Plasma', 'Storm', 'Temperate'];

const zoneOf = s => {
  const c = Number(s.whClass) || 0;
  if ((c >= 1 && c <= 6) || c >= 12) return 'wh';
  if (s.regionId === 10000070) return 'pochven';
  const sec = Math.round(s.security * 10) / 10;
  return sec >= 0.5 ? 'hs' : sec > 0 ? 'ls' : 'ns';
};

/**
 * opts: { from: systemId|name, types: ['Barren', ...], all (every type in one system), jumps (1-30), zones: ['hs','ls','ns'], bridges }
 */
function nearby(o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  if (!sde.hasPlanets()) { const e = new Error('Planet data needs a one-time game data refresh: Settings → Game data → Update.'); e.code = 'NO_PLANETS'; throw e; }
  const from = typeof o.from === 'number' ? o.from : sde.systemIdByName(String(o.from || '').trim());
  if (!from) throw new Error(`Unknown system "${o.from}".`);
  const fromSys = sde.system(from);
  if (zoneOf(fromSys) === 'wh') throw new Error('Start from a k-space system. Wormholes have no gates to search from.');
  const types = (o.types || []).filter(t => PI_TYPES.includes(t));
  if (!types.length) throw new Error('Pick at least one planet type.');
  const maxJ = Math.max(0, Math.min(30, Number(o.jumps) || 10));
  const zones = new Set((o.zones && o.zones.length ? o.zones : ['hs', 'ls', 'ns']));
  const dist = hunting.within(from, maxJ, !!o.bridges);
  const rows = [];
  for (const [id, jumps] of dist) {
    const s = sde.system(id); if (!s) continue;
    const zone = zoneOf(s);
    if (!zones.has(zone)) continue;
    const pl = sde.planetsIn(id) || {};
    const counts = Object.fromEntries(types.map(t => [t, pl[t] || 0]));
    const have = types.filter(t => counts[t] > 0);
    if (o.all ? have.length < types.length : !have.length) continue;
    rows.push({ id, name: s.name, jumps, security: s.security, zone, region: s.region, constellation: s.constellation, counts, matching: types.reduce((n, t) => n + counts[t], 0), typesMatched: have.length, planets: pl,
      total: Object.entries(pl).filter(([k]) => PI_TYPES.includes(k)).reduce((n, [, v]) => n + v, 0) });
  }
  // closest first; at the same distance, systems with more of what you asked for
  rows.sort((a, b) => a.jumps - b.jumps || b.typesMatched - a.typesMatched || b.matching - a.matching || a.name.localeCompare(b.name));
  // the nearest system for each type, for the summary line
  const nearest = Object.fromEntries(types.map(t => { const r = rows.find(x => x.counts[t] > 0); return [t, r ? { name: r.name, jumps: r.jumps } : null]; }));
  return { from: fromSys.name, fromZone: zoneOf(fromSys), types, all: !!o.all, jumps: maxJ, searched: dist.size, nearest, rows: rows.slice(0, 120), more: Math.max(0, rows.length - 120) };
}

module.exports = { nearby, PI_TYPES };
