'use strict';
/* Item database: stats, required skills, blueprint, reprocessing, what it's used in, and hub prices. */
const sde = require('./sde');
const market = require('./market');

const META = { 1: 'Tech I', 2: 'Tech II', 3: 'Storyline', 4: 'Faction', 5: 'Officer', 6: 'Deadspace', 14: 'Tech III', 15: 'Abyssal', 17: 'Premium', 19: 'Limited Time', 52: 'Structure Faction', 53: 'Structure Tech II', 54: 'Structure Tech I' };
// attributes shown elsewhere on the page, or not useful to read
const HIDE = new Set([182, 183, 184, 1285, 1289, 1290, 277, 278, 279, 1286, 1287, 1288, 633, 1692, 422, 162, 4, 38, 161]);

function fmtValue(a) {
  const v = a.value;
  switch (a.unitId) {
    case 101: return { text: +(v / 1000).toFixed(2) + ' s' };                       // milliseconds
    case 108: return { text: +((1 - v) * 100).toFixed(2) + '%' };                   // inverse absolute percent
    case 109: return { text: (v >= 1 ? '+' : '') + +((v - 1) * 100).toFixed(2) + '%' };   // modifier percent
    case 111: return { text: (v <= 1 ? '+' : '') + +((1 - v) * 100).toFixed(2) + '%' };   // inverse modifier percent
    case 127: return { text: +(v * 100).toFixed(2) + '%' };                          // absolute percent
    case 115: return { text: sde.groupName(v) || String(v) };                      // group
    case 116: { const t = sde.type(v); return { text: t ? t.name : String(v), typeId: t ? Number(v) : null }; }
    case 137: return { text: v ? 'Yes' : 'No' };
    default: {
      const digits = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 2 : 3;
      return { text: Number(v).toLocaleString('en-AU', { maximumFractionDigits: digits }) + (a.unit ? ' ' + a.unit : '') };
    }
  }
}

function search(q) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  return sde.search(q, { limit: 40 });
}

async function info(typeId, hub = 'Jita') {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const id = Number(typeId);
  const t = sde.type(id);
  if (!t) throw new Error('Unknown item.');
  const full = sde.fullAttrs(id);
  const attrs = full ? full.filter(a => !HIDE.has(a.id) && a.name && a.published).map(a => ({ ...a, ...fmtValue(a) })) : null;
  const groups = {};
  if (attrs) for (const a of attrs) (groups[a.category] = groups[a.category] || []).push({ name: a.name, text: a.text, typeId: a.typeId || null });
  const reqs = sde.requirements(id).map(r => ({ id: r.id, name: (sde.type(r.id) || {}).name, level: r.level }));
  const bpInfo = sde.blueprintFor(id);
  let build = null;
  if (bpInfo) {
    const bp = sde.blueprint(bpInfo.blueprintId); const act = bp && bp.a[bpInfo.activity];
    if (act) build = { blueprintId: bpInfo.blueprintId, blueprint: (sde.type(bpInfo.blueprintId) || {}).name, activity: bpInfo.activity, time: act.t,
      perRun: (act.p.find(p => p[0] === id) || [0, 1])[1], materials: act.m.map(([m, q]) => ({ id: m, name: (sde.type(m) || {}).name, qty: q })),
      skills: (act.s || []).map(([s, l]) => ({ id: s, name: (sde.type(s) || {}).name, level: l })) };
  }
  const rep = sde.reprocess(id);
  const reprocess = rep ? { portion: t.portionSize || 1, outputs: rep.map(([m, q]) => ({ id: m, name: (sde.type(m) || {}).name, qty: q })) } : null;
  const used = sde.usedIn(id).slice(0, 40).map(u => ({ ...u, name: (sde.type(u.productId) || {}).name })).filter(u => u.name);
  // hub prices
  let prices = null;
  if (t.marketGroupId) {
    const hubs = Object.keys(market.HUBS);
    const res = await Promise.all(hubs.map(h => market.prices([id], h).then(p => [h, p[id] || {}]).catch(() => [h, {}])));
    prices = res.map(([h, p]) => ({ hub: h, sell: p.sell ?? null, buy: p.buy ?? null, sellVolume: p.sellVolume || 0, buyVolume: p.buyVolume || 0 }));
    if (prices.every(p => p.sell === null && p.buy === null)) prices = { none: true, avg: (res[0][1] || {}).avg || 0 };
  }
  let matCost = null;
  if (build) { const mp = await market.prices(build.materials.map(m => m.id), hub); matCost = build.materials.reduce((n, m) => n + m.qty * ((mp[m.id] || {}).sell ?? (mp[m.id] || {}).avg ?? 0), 0) / (build.perRun || 1); }
  return {
    id, name: t.name, group: t.group, category: t.category, meta: META[t.metaGroupId] || null, volume: t.volume, portion: t.portionSize, basePrice: t.basePrice,
    published: t.published, onMarket: !!t.marketGroupId, attrs: groups, hasStats: !!full && sde.hasFull(), requirements: reqs, build, matCost, reprocess, usedIn: used, prices
  };
}

module.exports = { search, info };
