'use strict';
/* Build from what you mined: pick something to build and how many, and see the minerals the whole build
   needs, what your mined ore already covers (refined at your yield, after the refinery's tax), and what
   ore to go and mine for the rest. */
const sde = require('./sde');
const industry = require('./industry');
const market = require('./market');
const minetax = require('./minetax');

let refinable = null; // material typeId -> true, for anything ore, moon ore or ice reprocesses into
let oreList = null;   // [{ id, name, family, volume, portion, mats: [[typeId, qty]], highsec }]
const HIGHSEC_ORE = /^(veldspar|scordite|pyroxeres|plagioclase|omber|kernite|jaspet|hemorphite|hedbergite)$/i;
const BASE_NAME = t => t.name.replace(/^(Concentrated|Dense|Massive|Condensed|Iridescent|Luminous|Pure|Viscous|Solid|Prismatic|Obsidian|Onyx|Fiery|Glazed|Golden|Silvery|Sharp|Crystalline|Triclinic|Monoclinic|Bright|Gleaming|Vivid|Azure|Rich|Vitric|Radiant|Pristine|Lavish|Brimful|Glistening|Shimmering|Copious|Twinkling|Bountiful|Replete|Glowing|Shining|Opulent|Resplendent|Magma|Hadal|Jet|Stable|Fertile)\s+/i, '').replace(/\s+(II|III|IV)-Grade$/i, '');

function ores() {
  if (oreList) return oreList;
  const all = sde.typesWhere(t => t.published && t.volume > 0 && ['ore', 'moon', 'ice'].includes(industry.oreFamily(t)) && !/^(Batch )?Compressed /i.test(t.name));
  const comp = new Map(sde.typesWhere(t => t.published && /^Compressed /i.test(t.name)).map(t => [t.name.toLowerCase(), t]));
  oreList = all.map(t => ({ id: t.id, name: t.name, family: industry.oreFamily(t), volume: t.volume, portion: t.portionSize || 1, mats: sde.reprocess(t.id) || [],
    highsec: industry.oreFamily(t) === 'ore' && HIGHSEC_ORE.test(BASE_NAME(t)), grade: /\b(II|III|IV)-Grade$/i.test(t.name) || BASE_NAME(t) !== t.name ? 1 : 0,
    compressed: comp.get('compressed ' + t.name.toLowerCase()) || null })).filter(o => o.mats.length);
  refinable = new Set(); for (const o of oreList) for (const [m] of o.mats) refinable.add(m);
  return oreList;
}

/** Item to build: a product, or a blueprint (its product). */
function productOf(q) {
  let id = Number(q) || sde.typeIdByName(String(q || ''));
  if (!id) throw new Error(`Nothing called "${q}".`);
  const bp = sde.blueprint(id);
  if (bp) { const act = bp.a.manufacturing || bp.a.reaction; if (act && act.p && act.p[0]) id = act.p[0][0]; }
  if (!sde.blueprintFor(id)) throw new Error(`${(sde.type(id) || {}).name || id} isn't built from a blueprint.`);
  return id;
}

/** Everything the build needs, broken down to raw materials. Components and reactions are built too when deep is on. */
function rawNeeds(productId, qty, o) {
  const need = new Map(), built = new Map();
  const add = (m, q) => need.set(m, (need.get(m) || 0) + q);
  const walk = (id, units, depth, me) => {
    const bi = sde.blueprintFor(id); const act = sde.blueprint(bi.blueprintId).a[bi.activity];
    const per = (act.p.find(p => p[0] === id) || [0, 1])[1];
    const runs = Math.ceil(units / per);
    if (depth) built.set(id, (built.get(id) || 0) + runs * per);
    const factor = industry.meFactor({ me: me, activity: bi.activity, structure: o.structure, rig: o.rig, security: o.security });
    for (const [m, base] of act.m) {
      const q = industry.matQty(base, runs, factor);
      if (o.deep && depth < 6 && sde.blueprintFor(m) && !refinable.has(m) && (bi.activity !== 'manufacturing' || sde.blueprintFor(m).activity === 'manufacturing' || o.reactions)) walk(m, q, depth + 1, 10);
      else add(m, q);
    }
    return runs;
  };
  const runs = walk(productId, qty, 0, Number(o.me) || 0);
  return { need, runs, built };
}

/** Ore to cover the shortfall with the fewest m³ to mine (or, buying compressed ore, the least ISK).
    Solved exactly as a small linear program, then rounded up to whole refining batches. */
function orePlan(short, o) {
  const keep = (Number(o.yieldPct) || 87.5) / 100 * (1 - (Number(o.refineTax) || 0) / 100);
  const buy = o.goal === 'isk';
  let allowed = ores().filter(x => o.oreSet === 'moon' ? x.family === 'moon' : o.oreSet === 'ice' ? x.family === 'ice' : o.oreSet === 'any' ? x.family === 'ore' : o.oreSet === 'all' ? true : x.highsec);
  if (o.grades === 'base') allowed = allowed.filter(x => x.grade === 0);
  if (buy) allowed = allowed.filter(x => x.compressed && (o.price(x.compressed.id, 'sell') || 0) > 0);
  const need = [...short].filter(([, q]) => q > 0);
  const mats = need.map(([m]) => m);
  const uncovered = need.filter(([m]) => !allowed.some(x => x.mats.some(([mm, q]) => mm === m && q > 0)));
  const want = need.filter(([m]) => !uncovered.some(([u]) => u === m));
  const cols = want.map(([m]) => m);
  const rows = allowed.map(x => cols.map(m => { const e = x.mats.find(([mm]) => mm === m); return e ? e[1] * keep / x.portion : 0; }));
  const unitCost = x => (buy ? o.price(x.compressed.id, 'sell') : x.volume);
  const sol = want.length ? require('./lp').cover(rows, allowed.map(unitCost), want.map(([, q]) => q)) : { x: [] };
  const picked = new Map();
  if (sol) sol.x.forEach((u, i) => { if (u > 1e-6) picked.set(allowed[i].id, Math.ceil(u / allowed[i].portion - 1e-9) * allowed[i].portion); });
  void mats;
  const out = [...picked.entries()].map(([id, units]) => {
    const x = oreList.find(y => y.id === id);
    const batches = Math.floor(units / x.portion);
    return { typeId: id, name: x.name, family: x.family, units, m3: units * x.volume,
      compressed: x.compressed ? { typeId: x.compressed.id, name: x.compressed.name, m3: units * x.compressed.volume, cost: buy ? units * o.price(x.compressed.id, 'sell') : null } : null,
      gives: x.mats.map(([m, q]) => ({ typeId: m, name: (sde.type(m) || {}).name, qty: Math.floor(batches * q * keep) })) };
  }).sort((a, b) => b.m3 - a.m3);
  return { ores: out, uncovered: uncovered.map(([m, q]) => ({ typeId: m, name: (sde.type(m) || {}).name, qty: Math.ceil(q) })), optimal: !!sol };
}

/**
 * o: { charId, product (name, id or blueprint), qty, me, deep, reactions, period, useMined, oreSet: highsec|any|moon|ice|all, yieldPct, refineTax }
 */
async function plan(o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  ores();
  const productId = productOf(o.product);
  const qty = Math.max(1, Math.floor(Number(o.qty) || 1));
  const { need, runs, built } = rawNeeds(productId, qty, o);
  // What your mining refines into for the period (same yield and refining tax as the Mining page)
  let mined = new Map(), minedInfo = null;
  if (o.useMined !== false && o.charId) {
    const r = await minetax.report(Number(o.charId), { period: o.period || undefined, yieldPct: o.yieldPct, refineTax: o.refineTax });
    minedInfo = { period: r.period, from: r.from, to: r.to, yieldPct: r.minerals.yieldPct, taxPct: r.minerals.taxPct };
    for (const m of r.minerals.list) mined.set(m.typeId, m.qty);
    o.yieldPct = r.minerals.yieldPct; o.refineTax = r.minerals.taxPct;
  }
  const ids = [...need.keys()];
  const compIds = o.goal === 'isk' ? ores().filter(x => x.compressed).map(x => x.compressed.id) : [];
  const pr = await market.prices([...new Set([...ids, productId, ...compIds])], 'Jita').catch(() => ({}));
  const price = (id, side) => { const x = pr[id] || {}; return (side === 'sell' ? x.sell : x.buy) ?? x.avg ?? 0; };
  const minerals = [], other = [];
  const short = new Map();
  for (const [id, q] of need) {
    const t = sde.type(id) || { name: String(id) };
    if (refinable.has(id)) {
      const have = Math.min(q, mined.get(id) || 0);
      minerals.push({ typeId: id, name: t.name, need: q, have, short: q - have, spare: Math.max(0, (mined.get(id) || 0) - q), value: q * price(id) });
      if (q > have) short.set(id, q - have);
    } else other.push({ typeId: id, name: t.name, qty: q, value: q * price(id), buildable: !!sde.blueprintFor(id) });
  }
  minerals.sort((a, b) => b.value - a.value); other.sort((a, b) => b.value - a.value);
  const op = orePlan(short, { ...o, price });
  const prod = sde.type(productId);
  return {
    product: { typeId: productId, name: prod.name }, qty, runs, me: Number(o.me) || 0, deep: !!o.deep,
    built: [...built.entries()].map(([id, n]) => ({ typeId: id, name: (sde.type(id) || {}).name, qty: n })),
    minerals, other, mined: minedInfo, orePlan: op.ores, uncovered: op.uncovered,
    copyRuns: Number(o.bpRuns) > 0 ? Number(o.bpRuns) : null, notEnoughRuns: Number(o.bpRuns) > 0 && runs > Number(o.bpRuns),
    oreM3: op.ores.reduce((n, x) => n + x.m3, 0), goal: o.goal === 'isk' ? 'isk' : 'm3', optimal: op.optimal, oreCost: op.ores.reduce((n, x) => n + ((x.compressed && x.compressed.cost) || 0), 0), compressedM3: op.ores.reduce((n, x) => n + ((x.compressed && x.compressed.m3) || 0), 0), shortValue: minerals.reduce((n, m) => n + m.short * price(m.typeId), 0)
  };
}

module.exports = { plan, ores: () => ores(), baseName: t => BASE_NAME(t), _orePlan: orePlan, _reset: () => { oreList = null; refinable = null; } };
