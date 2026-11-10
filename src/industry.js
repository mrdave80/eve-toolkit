// Industry calculations: manufacturing/reactions with structure & rig bonuses,
// job costs from live system cost indices, build-vs-buy trees, invention and reprocessing.
const sde = require('./sde');
const market = require('./market');
const { get, safe, ok } = require('./esi');

const STRUCTURES = {
  npc:     { label: 'NPC station', me: 0, te: 0, cost: 0, kind: 'any' },
  raitaru: { label: 'Raitaru', me: 0.01, te: 0.15, cost: 0.03, kind: 'eng' },
  azbel:   { label: 'Azbel', me: 0.01, te: 0.20, cost: 0.04, kind: 'eng' },
  sotiyo:  { label: 'Sotiyo', me: 0.01, te: 0.30, cost: 0.05, kind: 'eng' },
  athanor: { label: 'Athanor', me: 0, te: 0, cost: 0, kind: 'ref' },
  tatara:  { label: 'Tatara', me: 0, te: 0.25, cost: 0, kind: 'ref' }
};
const RIG = { none: { me: 0, te: 0 }, t1: { me: 0.02, te: 0.20 }, t2: { me: 0.024, te: 0.24 } };
const SEC = { hs: 1.0, ls: 1.9, ns: 2.1 };
const SCC = 0.04;

const DECRYPTORS = {
  none: { label: 'No decryptor', prob: 1, runs: 0, me: 0, te: 0 },
  'Accelerant Decryptor': { label: 'Accelerant', prob: 1.2, runs: 1, me: 2, te: 10 },
  'Attainment Decryptor': { label: 'Attainment', prob: 1.8, runs: 4, me: -1, te: 4 },
  'Augmentation Decryptor': { label: 'Augmentation', prob: 0.6, runs: 9, me: -2, te: 2 },
  'Optimized Attainment Decryptor': { label: 'Optimized Attainment', prob: 1.9, runs: 2, me: 1, te: -2 },
  'Optimized Augmentation Decryptor': { label: 'Optimized Augmentation', prob: 0.9, runs: 7, me: 2, te: 0 },
  'Parity Decryptor': { label: 'Parity', prob: 1.5, runs: 3, me: 1, te: -2 },
  'Process Decryptor': { label: 'Process', prob: 1.1, runs: 0, me: 3, te: 6 },
  'Symmetry Decryptor': { label: 'Symmetry', prob: 1.0, runs: 2, me: 1, te: 8 }
};

// ---------- Public data: cost indices and adjusted prices ----------

let idxCache = { at: 0, map: new Map() };
async function costIndices() {
  if (Date.now() - idxCache.at < 3600000 && idxCache.map.size) return idxCache.map;
  const list = await get('/industry/systems/');
  const map = new Map();
  for (const s of list) map.set(s.solar_system_id, Object.fromEntries(s.cost_indices.map(c => [c.activity, c.cost_index])));
  idxCache = { at: Date.now(), map };
  return map;
}
let adjCache = { at: 0, map: new Map() };
async function adjustedPrices() {
  if (Date.now() - adjCache.at < 3600000 && adjCache.map.size) return adjCache.map;
  const list = await get('/markets/prices/');
  adjCache = { at: Date.now(), map: new Map(list.map(p => [p.type_id, p.adjusted_price || p.average_price || 0])) };
  return adjCache.map;
}

// ---------- Core formulas ----------

function meFactor(o) {
  const st = STRUCTURES[o.structure] || STRUCTURES.npc;
  const rig = RIG[o.rig] || RIG.none;
  const sec = SEC[o.security] || 1;
  const bpMe = o.activity === 'reaction' ? 0 : (o.me || 0) / 100;
  return (1 - bpMe) * (1 - st.me) * (1 - rig.me * sec);
}

function matQty(base, runs, factor) {
  return Math.max(runs, Math.ceil(Math.round(base * runs * factor * 100) / 100));
}

function jobSeconds(baseTime, runs, o) {
  const st = STRUCTURES[o.structure] || STRUCTURES.npc;
  const rig = RIG[o.rig] || RIG.none;
  const sec = SEC[o.security] || 1;
  const s = o.skills || {};
  let t = baseTime * runs;
  if (o.activity === 'reaction') t *= (1 - 0.04 * (s.reactions ?? 5));
  else { t *= (1 - (o.te || 0) / 100) * (1 - 0.04 * (s.industry ?? 5)) * (1 - 0.03 * (s.advancedIndustry ?? 5)); }
  return t * (1 - st.te) * (1 - rig.te * sec);
}

/**
 * Calculate one manufacturing/reaction job. `o`:
 * { productTypeId, runs, me, te, structure, rig, security, systemId, costIndex, facilityTax, hub,
 *   build: [typeIds of components to build], componentMe, componentTe, skills }
 */
async function calculate(o, depth = 0, priceMap = null) {
  const bpInfo = sde.blueprintFor(o.productTypeId);
  if (!bpInfo) throw new Error('No blueprint or reaction formula produces this item.');
  const bp = sde.blueprint(bpInfo.blueprintId);
  const act = bp.a[bpInfo.activity];
  const opts = { ...o, activity: bpInfo.activity, runs: Math.max(1, Math.floor(o.runs || 1)) };
  const prodPerRun = (act.p.find(p => p[0] === o.productTypeId) || [0, 1])[1];
  const factor = meFactor(opts);

  // Collect every type we might need prices for (one round trip)
  if (!priceMap) {
    const ids = new Set([o.productTypeId]);
    const walk = (typeId, d) => {
      const bi = sde.blueprintFor(typeId); if (!bi || d > 4) return;
      for (const [m] of sde.blueprint(bi.blueprintId).a[bi.activity].m) { ids.add(m); if ((o.build || []).includes(m)) walk(m, d + 1); }
    };
    walk(o.productTypeId, 0);
    priceMap = await market.prices([...ids], o.hub || 'Jita');
  }
  const price = (id, side = 'sell') => { const p = priceMap[id]; if (!p) return 0; return (side === 'buy' ? p.buy : p.sell) ?? p.avg ?? 0; };

  const materials = [];
  for (const [typeId, base] of act.m) {
    const qty = matQty(base, opts.runs, factor);
    const t = sde.type(typeId) || { name: `Type ${typeId}` };
    const canBuild = !!sde.blueprintFor(typeId);
    let built = null;
    if (canBuild && (o.build || []).includes(typeId) && depth < 4) {
      const sub = sde.blueprint(sde.blueprintFor(typeId).blueprintId).a[sde.blueprintFor(typeId).activity];
      const per = (sub.p.find(p => p[0] === typeId) || [0, 1])[1];
      const subRuns = Math.ceil(qty / per);
      built = await calculate({ ...o, productTypeId: typeId, runs: subRuns, me: o.componentMe ?? 10, te: o.componentTe ?? 20 }, depth + 1, priceMap);
      built.surplus = subRuns * per - qty;
    }
    const buyCost = qty * price(typeId, 'sell');
    materials.push({ typeId, name: t.name, base, qty, unit: price(typeId, 'sell'), buyCost, canBuild, built,
      cost: built ? built.totalCost * (qty / (qty + (built.surplus || 0))) : buyCost });
  }

  // Job installation cost: EIV × (system index × (1 − structure bonus) + facility tax + SCC)
  const adj = await adjustedPrices();
  const eiv = act.m.reduce((n, [id, base]) => n + base * (adj.get(id) || 0), 0) * opts.runs;
  let index = o.costIndex;
  if (index === undefined || index === null) {
    const idx = o.systemId ? await safe(() => costIndices()) : null;
    index = idx && ok(idx) && idx.get(o.systemId) ? (idx.get(o.systemId)[bpInfo.activity === 'reaction' ? 'reaction' : 'manufacturing'] || 0) : 0.05;
  }
  const st = STRUCTURES[o.structure] || STRUCTURES.npc;
  const jobCost = eiv * (index * (1 - st.cost) + (o.facilityTax ?? 0) / 100 + SCC);

  const materialCost = materials.reduce((n, m) => n + m.cost, 0);
  const totalCost = materialCost + jobCost;
  const outQty = opts.runs * prodPerRun;
  const sell = price(o.productTypeId, 'sell'), buy = price(o.productTypeId, 'buy');
  const seconds = jobSeconds(act.t, opts.runs, opts);
  return {
    product: sde.type(o.productTypeId), productTypeId: o.productTypeId, blueprintId: bpInfo.blueprintId, blueprint: (sde.type(bpInfo.blueprintId) || {}).name,
    activity: bpInfo.activity, runs: opts.runs, outQty, maxRuns: bp.max, materials, materialCost, jobCost, eiv, costIndex: index, totalCost,
    unitCost: totalCost / outQty, sellPrice: sell, buyPrice: buy, revenueSell: outQty * sell, revenueBuy: outQty * buy,
    profitSell: outQty * sell - totalCost, profitBuy: outQty * buy - totalCost, seconds,
    iskPerHour: seconds ? (outQty * sell - totalCost) / (seconds / 3600) : 0,
    skills: act.s.map(([id, l]) => ({ id, level: l, name: (sde.type(id) || {}).name }))
  };
}

// ---------- Invention ----------

async function invention(o) {
  // o: { productTypeId (T2 item), decryptor, skills: { encryption, science1, science2 }, hub, structure, ... }
  const bpInfo = sde.blueprintFor(o.productTypeId);
  if (!bpInfo) throw new Error('No blueprint for that item.');
  const t1bps = sde.inventedFrom(bpInfo.blueprintId);
  if (!t1bps.length) throw new Error('This item is not invented (it has no invention source).');
  const t1 = sde.blueprint(t1bps[0]);
  const inv = t1.a.invention;
  const outp = inv.p.find(p => p[0] === bpInfo.blueprintId) || inv.p[0];
  const dec = DECRYPTORS[o.decryptor] || DECRYPTORS.none;
  const s = o.skills || {};
  const skillIds = inv.s.map(x => x[0]);
  // SDE lists the 2 science skills and the encryption skill; encryption skills are named "... Encryption Methods"
  const names = skillIds.map(id => (sde.type(id) || {}).name || '');
  const encIdx = names.findIndex(n => /Encryption/i.test(n));
  const sci = skillIds.filter((_, i) => i !== encIdx);
  const lv = id => (s.levels && s.levels[id] !== undefined ? s.levels[id] : (s.default ?? 4));
  const enc = encIdx >= 0 ? lv(skillIds[encIdx]) : 4;
  const sciSum = sci.reduce((n, id) => n + lv(id), 0);
  const prob = Math.min(1, (outp[2] || 0.3) * (1 + sciSum / 30 + enc / 40) * dec.prob);
  const runsPerSuccess = outp[1] + dec.runs;
  const ids = [...inv.m.map(m => m[0]), o.productTypeId];
  const decId = dec !== DECRYPTORS.none ? sde.typeIdByName(o.decryptor) : null;
  if (decId) ids.push(decId);
  const prices = await market.prices(ids, o.hub || 'Jita');
  const pr = id => { const p = prices[id]; return p ? (p.sell ?? p.avg ?? 0) : 0; };
  const mats = inv.m.map(([id, q]) => ({ typeId: id, name: (sde.type(id) || {}).name, qty: q, unit: pr(id), cost: q * pr(id) }));
  const attemptCost = mats.reduce((n, m) => n + m.cost, 0) + (decId ? pr(decId) : 0);
  const perSuccess = attemptCost / prob;
  const perRun = perSuccess / runsPerSuccess;
  // Manufacturing with the invented BPC (base ME 2 / TE 4 + decryptor)
  const build = await calculate({ ...o, me: 2 + dec.me, te: 4 + dec.te, runs: runsPerSuccess });
  return {
    t1Blueprint: (sde.type(t1bps[0]) || {}).name, t2Blueprint: (sde.type(bpInfo.blueprintId) || {}).name,
    baseProbability: outp[2], probability: prob, runsPerSuccess, materials: mats, attemptCost, perSuccess, perRun,
    me: 2 + dec.me, te: 4 + dec.te, skills: skillIds.map((id, i) => ({ id, name: names[i], level: lv(id), encryption: i === encIdx })),
    build, totalPerUnit: (build.totalCost + perSuccess) / build.outQty,
    decryptors: Object.entries(DECRYPTORS).map(([k, v]) => ({ key: k, ...v }))
  };
}

// ---------- Reprocessing ----------

function reprocessYield(o) {
  const SECB = { hs: 0, ls: 0.06, ns: 0.12 };
  const base = (o.base ?? 50) + (o.rig ?? 0);
  const skills = (1 + 0.03 * (o.reprocessing ?? 5)) * (1 + 0.02 * (o.efficiency ?? 5)) * (1 + 0.02 * (o.specific ?? 4)) * (1 + (o.implant ?? 0) / 100);
  return Math.min(1, base / 100 * (1 + (o.structure === 'npc' ? 0 : SECB[o.security] || 0)) * skills);
}

async function reprocess(items, o) {
  const yieldOre = reprocessYield(o);
  const yieldScrap = Math.min(1, 0.5 * (1 + 0.02 * (o.scrapmetal ?? 4)));
  const out = new Map();
  const rows = [];
  for (const it of items) {
    const t = sde.type(it.typeId);
    const mats = sde.reprocess(it.typeId);
    if (!t || !mats) { rows.push({ ...it, name: t ? t.name : it.name, reprocessable: false }); continue; }
    const isOre = [25, 2143].includes(t.categoryId) || /Ore|Ice/i.test(t.category || '');
    const y = isOre ? yieldOre : yieldScrap;
    const batches = Math.floor(it.qty / (t.portionSize || 1));
    const leftover = it.qty - batches * (t.portionSize || 1);
    const got = mats.map(([m, q]) => [m, Math.floor(q * batches * y)]);
    for (const [m, q] of got) out.set(m, (out.get(m) || 0) + q);
    rows.push({ typeId: it.typeId, name: t.name, qty: it.qty, batches, leftover, yield: y, ore: isOre, outputs: got, reprocessable: true });
  }
  const ids = [...new Set([...out.keys(), ...items.map(i => i.typeId)])];
  const prices = await market.prices(ids, o.hub || 'Jita');
  const p = (id, side) => { const x = prices[id]; return x ? ((side === 'buy' ? x.buy : x.sell) ?? x.avg ?? 0) : 0; };
  const minerals = [...out.entries()].map(([id, q]) => ({ typeId: id, name: (sde.type(id) || {}).name, qty: q, buy: p(id, 'buy') * q, sell: p(id, 'sell') * q })).sort((a, b) => b.sell - a.sell);
  for (const r of rows) {
    r.sellAsIsBuy = p(r.typeId, 'buy') * r.qty;
    r.sellAsIsSell = p(r.typeId, 'sell') * r.qty;
    r.reprocessBuy = r.reprocessable ? r.outputs.reduce((n, [m, q]) => n + p(m, 'buy') * q, 0) : 0;
    r.verdict = !r.reprocessable ? 'sell' : r.reprocessBuy > r.sellAsIsBuy ? 'reprocess' : 'sell';
  }
  return { yieldOre, yieldScrap, rows, minerals, totalBuy: minerals.reduce((n, m) => n + m.buy, 0), totalSell: minerals.reduce((n, m) => n + m.sell, 0) };
}

// ---------- Ore, ice and gas: what is a cubic metre worth? ----------

function oreFamily(t) {
  if (t.group === 'Harvestable Cloud') return 'gas';
  if (t.categoryId !== 25 && !/^Asteroid$/i.test(t.category)) return null;
  if (/Moon Asteroids/i.test(t.group)) return 'moon';
  if (/Ice/i.test(t.group)) return 'ice';
  return 'ore';
}

/** For each ore of a family: ISK per m³ mined, sold raw, compressed, or reprocessed at your yield. */
async function oreTable(o = {}) {
  const fam = o.family || 'ore';
  const all = sde.typesWhere(t => t.published && t.marketGroupId && oreFamily(t) === fam);
  const byName = new Map(all.map(t => [t.name.toLowerCase(), t]));
  let extra = null; // compressed gas lives in its own group, so look it up across all types once
  const compressedOf = t => {
    const k = 'compressed ' + t.name.toLowerCase();
    if (byName.has(k)) return byName.get(k);
    if (!extra) extra = new Map(sde.typesWhere(x => x.published && /^compressed /i.test(x.name)).map(x => [x.name.toLowerCase(), x]));
    return extra.get(k) || null;
  };
  const base = all.filter(t => !/^(Batch )?Compressed /i.test(t.name) && t.volume > 0);
  const y = fam === 'ore' || fam === 'moon' || fam === 'ice' ? reprocessYield(o) : null;
  const rows = base.map(t => ({ t, c: compressedOf(t), mats: y ? (sde.reprocess(t.id) || []) : [] }));
  const ids = new Set();
  for (const r of rows) { ids.add(r.t.id); if (r.c) ids.add(r.c.id); for (const [m] of r.mats) ids.add(m); }
  const prices = await market.prices([...ids], o.hub || 'Jita');
  const side = o.side === 'sell' ? 'sell' : 'buy';
  const p = id => { const x = prices[id]; return x ? (x[side] ?? x.avg ?? 0) || 0 : 0; };
  const out = rows.map(({ t, c, mats }) => {
    const raw = p(t.id) / t.volume;
    const comp = c ? p(c.id) / t.volume : null; // compression is one unit for one unit, so per raw m³
    const portion = t.portionSize || 1;
    const rep = mats.length ? mats.reduce((n, [m, q]) => n + p(m) * q * y, 0) / (portion * t.volume) : null;
    const best = Math.max(raw, comp || 0, rep || 0);
    return { typeId: t.id, name: t.name, group: t.group, volume: t.volume, portion, compressedId: c ? c.id : null, compressedVolume: c ? c.volume : null,
      raw, compressed: comp, reprocessed: rep, best, verdict: best === 0 ? null : best === rep ? 'reprocess' : best === comp ? 'compress' : 'raw',
      perHour: o.m3PerHour ? best * Number(o.m3PerHour) : null,
      materials: mats.map(([m, q]) => ({ typeId: m, name: (sde.type(m) || {}).name, qty: Math.floor(q * y), value: p(m) * Math.floor(q * y) })) };
  }).sort((a, b) => b.best - a.best);
  return { family: fam, yield: y, side, hub: o.hub || 'Jita', rows: out };
}

module.exports = { oreTable, oreFamily, STRUCTURES, DECRYPTORS, costIndices, calculate, invention, reprocess, reprocessYield, matQty, meFactor };
