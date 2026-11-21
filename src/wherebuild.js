'use strict';
/* Where to build: systems near you ranked by CCP's industry cost index for an activity, with the NPC
   stations there and, for a chosen item, what the job would cost in each. Job cost uses EVE's formula:
   estimated item value x (system index x (1 - structure bonus) + facility tax + SCC surcharge). */
const sde = require('./sde');
const industry = require('./industry');
const { get } = require('./esi');

const ACTS = { manufacturing: 'manufacturing', reaction: 'reaction', invention: 'invention', copying: 'copying', me: 'researching_material_efficiency', te: 'researching_time_efficiency' };
const SCC = 0.04;
const secOk = (sec, want) => (want === 'hs' ? sec >= 0.45 : want === 'ls' ? sec > 0 && sec < 0.45 : want === 'ns' ? sec <= 0 : want === 'empire' ? sec > 0 : true);

function distances(from, max) {
  const dist = new Map(from.map(f => [Number(f), 0]));
  let frontier = from.map(Number);
  for (let d = 1; d <= max && frontier.length; d++) {
    const next = [];
    for (const s of frontier) for (const g of sde.gates(s)) { const n = Number(g); if (!dist.has(n)) { dist.set(n, d); next.push(n); } }
    frontier = next;
  }
  return dist;
}

let adj = { at: 0, map: new Map() };
async function adjusted() {
  if (Date.now() - adj.at < 3600000 && adj.map.size) return adj.map;
  const list = await get('/markets/prices/');
  adj = { at: Date.now(), map: new Map(list.map(p => [p.type_id, p.adjusted_price || p.average_price || 0])) };
  return adj.map;
}

/**
 * o: { from: [systemIds] or a system name, maxJumps, activity, security: any|hs|ls|ns|empire, product (name), runs, structure, facilityTax (%) }
 */
async function find(o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  let from = Array.isArray(o.from) ? o.from.map(Number).filter(Boolean) : [];
  if (!from.length && o.fromName) { const id = sde.systemIdByName(String(o.fromName)); if (!id) throw new Error(`Unknown system "${o.fromName}".`); from = [id]; }
  if (!from.length) throw new Error('Pick a system to search from.');
  const maxJ = Math.max(0, Math.min(30, Number(o.maxJumps) || 10));
  const act = ACTS[o.activity] || 'manufacturing';
  const idx = await industry.costIndices();
  const dist = distances(from, maxJ);
  const stationsBy = new Map();
  for (const [, st] of Object.entries((sde.agentData() || {}).stations || {})) stationsBy.set(Number(st[0]), (stationsBy.get(Number(st[0])) || 0) + 1);
  // job value for the item, if one was given
  let eiv = null, product = null;
  if (o.product) {
    const pid = Number(o.product) || sde.typeIdByName(String(o.product));
    const bi = pid ? sde.blueprintFor(pid) : null;
    if (!bi) throw new Error(`"${o.product}" isn't built from a blueprint.`);
    const a = await adjusted();
    const acts = sde.blueprint(bi.blueprintId).a[bi.activity];
    const runs = Math.max(1, Math.floor(Number(o.runs) || 1));
    eiv = acts.m.reduce((n, [id, q]) => n + q * (a.get(id) || 0), 0) * runs;
    product = { typeId: pid, name: (sde.type(pid) || {}).name, runs };
  }
  const st = industry.STRUCTURES[o.structure] || industry.STRUCTURES.npc;
  const tax = (Number(o.facilityTax) || (o.structure && o.structure !== 'npc' ? 0 : 0.25)) / 100;
  const rows = [];
  for (const [id, j] of dist) {
    const s = sde.system(id); if (!s || (s.whClass >= 1 && s.whClass <= 6) || s.whClass >= 12) continue;
    if (!secOk(Number(s.security), o.security)) continue;
    const ci = (idx.get(id) || {})[act];
    if (ci === undefined) continue;
    rows.push({ systemId: id, system: s.name, region: s.region, security: s.security, jumps: j, index: ci, stations: stationsBy.get(id) || 0,
      jobCost: eiv !== null ? eiv * (ci * (1 - st.cost) + tax + SCC) : null });
  }
  rows.sort((a, b) => a.index - b.index || a.jumps - b.jumps);
  const here = rows.filter(r => r.jumps === 0);
  return { activity: o.activity || 'manufacturing', product, eiv, rows: rows.slice(0, Number(o.limit) || 60), here, checked: rows.length };
}

module.exports = { find, _distances: distances };
