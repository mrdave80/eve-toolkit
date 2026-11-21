'use strict';
/* Where to mine a mineral: which ores (and ice) refine into it, how much each m³ gives at your yield,
   and the nearest places to get them:
   - places you know it was: your pilots' mining ledgers (last 30 days) and ore sightings,
   - the usual space for each ore (security band), from the EVE University ore table, nearest by gates.
   CCP doesn't publish belt contents, so the second list is "usually found", not a guarantee. */
const sde = require('./sde');
const store = require('./store');
const minebuild = require('./minebuild');
const { get, safe, ok } = require('./esi');

// Usual places for each base ore. sec: [min, max] true-sec band, pochven / moon flags for the rest.
const WHERE = {
  Veldspar: { sec: [0.45, 1], text: 'Highsec belts' },
  Scordite: { sec: [0.45, 1], text: 'Highsec belts' },
  Pyroxeres: { sec: [-1, 0.95], text: 'Highsec 0.9–0.5 (Amarr and Caldari space), lowsec, nullsec, wormholes' },
  Plagioclase: { sec: [0.45, 0.95], text: 'Highsec 0.9–0.5 (Caldari, Gallente and Minmatar space)' },
  Omber: { sec: [-1, 0.45], text: 'Lowsec belts (Gallente, Minmatar), nullsec, wormholes; rare highsec anomalies' },
  Kernite: { sec: [-1, 0.45], text: 'Lowsec belts (Amarr, Caldari, Minmatar), nullsec, wormholes; rare highsec anomalies' },
  Jaspet: { sec: [0.05, 0.45], text: 'Lowsec belts and anomalies (Amarr, Gallente)' },
  Hemorphite: { sec: [0.05, 0.25], text: 'Lowsec 0.2–0.1 (Amarr, Gallente) and lowsec anomalies' },
  Hedbergite: { sec: [0.05, 0.25], text: 'Lowsec 0.2–0.1 (Caldari, Minmatar) and lowsec anomalies' },
  Gneiss: { sec: [0.05, 0.45], text: 'Lowsec ore anomalies, wormholes' },
  'Dark Ochre': { sec: [0.05, 0.45], text: 'Lowsec ore anomalies' },
  Crokite: { sec: [-1, 0.45], text: 'Lowsec ore anomalies, nullsec' },
  Bistot: { sec: [-1, -0.45], text: 'Nullsec belts (about −0.5 and below), wormholes' },
  Arkonor: { sec: [-1, -0.55], text: 'Nullsec belts (about −0.6 and below), wormholes' },
  Mercoxit: { sec: [-1, -0.75], text: 'Nullsec −0.8 and below (needs deep core mining)' },
  Spodumain: { pochven: true, text: 'Pochven' },
  Bezdnacine: { pochven: true, text: 'Pochven' },
  Rakovene: { pochven: true, text: 'Pochven' },
  Talassonite: { pochven: true, text: 'Pochven' },
  Ytirium: { sec: [0.05, 0.55], text: 'Rare border sites where highsec meets lowsec' },
  Ducinium: { sec: [0.05, 0.55], text: 'Rare border sites where highsec meets lowsec' },
  Eifyrium: { sec: [0.05, 0.55], text: 'Rare border sites where highsec meets lowsec' },
  Mordunium: { sec: [0.05, 0.5], text: 'Lowsec (not faction warfare), rare highsec 0.5 deposits next to lowsec' },
  Griemeer: { sec: [-1, 0], text: 'Sovereign nullsec prospecting arrays' },
  Hezorime: { sec: [-1, 0], text: 'Sovereign nullsec prospecting arrays' },
  Kylixium: { sec: [-1, 0], text: 'Sovereign nullsec prospecting arrays' },
  Nocxite: { sec: [-1, 0], text: 'Sovereign nullsec prospecting arrays' },
  Ueganite: { sec: [-1, 0], text: 'Sovereign nullsec prospecting arrays' }
};

function minerals() {
  const set = new Map();
  for (const o of minebuild.ores()) for (const [m] of o.mats) if (!set.has(m)) set.set(m, (sde.type(m) || {}).name || String(m));
  return [...set.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Nearest system (by gates) from any start whose security fits [min, max]. */
function nearestInBand(starts, band, maxJ = 40) {
  const dist = new Map(); let frontier = [];
  for (const s of starts) { dist.set(s.systemId, { j: 0, pilot: s.pilot }); frontier.push(s.systemId); }
  const fits = id => { const s = sde.system(id); if (!s || (s.whClass >= 1 && s.whClass <= 6) || s.whClass >= 12) return null; const sec = Number(s.security); return sec >= band[0] && sec <= band[1] ? s : null; };
  for (const id of frontier) { const s = fits(id); if (s) return { systemId: id, system: s.name, region: s.region, security: s.security, jumps: 0, pilot: dist.get(id).pilot }; }
  for (let d = 1; d <= maxJ && frontier.length; d++) {
    const next = []; let best = null;
    for (const id of frontier) for (const g of sde.gates(id)) {
      const n = Number(g); if (dist.has(n)) continue;
      dist.set(n, { j: d, pilot: dist.get(id).pilot }); next.push(n);
      if (!best) { const s = fits(n); if (s) best = { systemId: n, system: s.name, region: s.region, security: s.security, jumps: d, pilot: dist.get(n).pilot }; }
    }
    if (best) return best;
    frontier = next;
  }
  return null;
}

/**
 * o: { mineral (name or id), yieldPct, fromName (system) } — starts from your pilots' locations otherwise.
 */
async function find(o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const mid = Number(o.mineral) || sde.typeIdByName(String(o.mineral || ''));
  if (!mid) throw new Error(`Nothing called "${o.mineral}".`);
  const keep = (Number(o.yieldPct) || 87.5) / 100;
  // where you are
  let starts = [];
  if (o.fromName) { const id = sde.systemIdByName(String(o.fromName)); if (!id) throw new Error(`Unknown system "${o.fromName}".`); starts = [{ systemId: id, pilot: null }]; }
  else for (const c of (store.get().characters || []).filter(x => !x.needsReauth)) { const r = await safe(() => get(`/characters/${c.id}/location/`, c.id)); if (ok(r)) starts.push({ systemId: r.solar_system_id, pilot: c.name }); }
  // places you know: pilots' mining ledgers
  const seen = new Map(); // base ore name -> [{system, systemId, date, pilot}]
  for (const c of (store.get().characters || []).filter(x => !x.needsReauth && (x.scopes || []).includes('esi-industry.read_character_mining.v1'))) {
    const rows = await safe(() => get(`/characters/${c.id}/mining/`, c.id));
    if (!ok(rows)) continue;
    for (const r of rows) {
      const t = sde.type(r.type_id); if (!t) continue;
      const base = minebuild.baseName(t);
      const list = seen.get(base) || []; const s = sde.system(r.solar_system_id);
      if (!list.some(x => x.systemId === r.solar_system_id)) list.push({ systemId: r.solar_system_id, system: s ? s.name : String(r.solar_system_id), security: s ? s.security : null, date: r.date, pilot: c.name });
      else { const x = list.find(y => y.systemId === r.solar_system_id); if (r.date > x.date) x.date = r.date; }
      seen.set(base, list);
    }
  }
  // which ores give it
  const all = minebuild.ores().filter(x => x.mats.some(([m]) => m === mid));
  const byBase = new Map();
  for (const x of all) {
    const t = sde.type(x.id); const base = x.family === 'ice' ? x.name : minebuild.baseName(t);
    const per = x.mats.find(([m]) => m === mid)[1] * keep / x.portion;
    const perM3 = per / x.volume;
    const others = x.mats.filter(([m]) => m !== mid).map(([m, q]) => ({ name: (sde.type(m) || {}).name, perM3: q * keep / x.portion / x.volume }));
    const cur = byBase.get(base);
    if (!cur || perM3 > cur.best.perM3) byBase.set(base, { base, family: x.family, best: { typeId: x.id, name: x.name, perM3, perUnit: per, others }, variants: (cur ? cur.variants : 0) + 1 });
    else cur.variants++;
  }
  const out = [];
  for (const b of byBase.values()) {
    const w = WHERE[b.base] || null;
    let usual = null, nearest = null;
    if (b.family === 'moon') usual = 'Moon ore: from moon drilling at a corp refinery';
    else if (b.family === 'ice') { usual = 'Ice belts in the systems where ice spawns'; const n = starts.length ? require('./icesystems').nearest(starts, { maxJumps: 30, limit: 1 })[0] : null; if (n) nearest = { systemId: n.systemId, system: n.system, region: n.region, security: n.security, jumps: n.jumps, pilot: n.pilot, ice: true }; }
    else if (w) { usual = w.text; if (w.pochven) nearest = { pochven: true }; else if (w.sec && starts.length) nearest = nearestInBand(starts, w.sec); }
    const known = (seen.get(b.base) || []).sort((a, c) => String(c.date).localeCompare(String(a.date))).slice(0, 5);
    out.push({ ...b, usual, nearest, known });
  }
  out.sort((a, b) => b.best.perM3 - a.best.perM3);
  return { mineral: { id: mid, name: (sde.type(mid) || {}).name }, yieldPct: keep * 100, ores: out, from: starts.map(s => s.pilot).filter(Boolean) };
}

module.exports = { find, minerals, WHERE, _nearestInBand: nearestInBand };
