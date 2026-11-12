'use strict';
/* Contract bargain finder: public item-exchange contracts priced well under what their items sell for in Jita.
   Contract contents never change, so they're cached on this PC and each scan only reads new contracts. */
const store = require('./store');
const sde = require('./sde');
const market = require('./market');
const { get, getAllPages, safe, ok, marketPrices } = require('./esi');
const couriers = require('./couriers');

const listCache = new Map();    // regionId -> { at, list }
const DAY = 86400000;

function itemCache() { const d = store.get(); d.contractItems = d.contractItems || {}; return d.contractItems; }
function prune() {
  const c = itemCache(); const now = Date.now(); let n = 0;
  for (const [id, v] of Object.entries(c)) if (!v.exp || v.exp < now) { delete c[id]; n++; }
  return n;
}

async function regionContracts(regionId) {
  const hit = listCache.get(regionId);
  if (hit && Date.now() - hit.at < 25 * 60000) return hit.list;
  const list = await getAllPages(`/contracts/public/${regionId}/`, null, 60);
  listCache.set(regionId, { at: Date.now(), list });
  return list;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } }));
}

/**
 * opts: { regionId, minProfit, minPct, minPrice, maxPrice, maxNew (contracts to read this scan), highsecOnly, includeBpc }
 */
async function scan(o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const regionId = Number(o.regionId) || 10000002;
  const minProfit = Math.max(0, Number(o.minProfit) || 10e6), minPct = Math.max(0, Math.min(95, Number(o.minPct) || 15)) / 100;
  const minPrice = Math.max(0, Number(o.minPrice) || 0), maxPrice = Number(o.maxPrice) || Infinity;
  const maxNew = Math.max(50, Math.min(2000, Number(o.maxNew) || 400));
  const now = Date.now();
  const list = (await regionContracts(regionId)).filter(c => c.type === 'item_exchange' && Date.parse(c.date_expired) > now && c.price >= minPrice && c.price <= maxPrice);
  list.sort((a, b) => Date.parse(b.date_issued) - Date.parse(a.date_issued));
  const cache = itemCache(); prune();
  const todo = list.filter(c => !cache[c.contract_id]).slice(0, maxNew);
  let failed = 0;
  await pool(todo, 8, async c => {
    const r = await safe(() => getAllPages(`/contracts/public/items/${c.contract_id}/`, null, 5));
    if (!ok(r)) { failed++; return; }
    // [typeId, qty, included, bpc, runs, me, te]
    cache[c.contract_id] = { exp: Date.parse(c.date_expired), items: itemsTuple(r) };
  });
  store.save('contractItems');

  // Screen with CCP's average prices, then price the likely bargains from live Jita orders.
  const avg = await marketPrices();
  const known = list.filter(c => cache[c.contract_id]);
  const roughVal = c => cache[c.contract_id].items.reduce((n, [t, q, inc, bpc]) => n + (bpc ? 0 : (avg.get(t) || 0) * q * (inc ? 1 : -1)), 0);
  const candidates = known.filter(c => roughVal(c) - c.price > minProfit * 0.5).slice(0, 250);
  const ids = [...new Set(candidates.flatMap(c => cache[c.contract_id].items.filter(x => !x[3]).map(x => x[0])))];
  const prices = ids.length ? await market.prices(ids, 'Jita') : {};
  const P = (t, side) => { const p = prices[t] || {}; return side === 'buy' ? (p.buy ?? 0) : (p.sell ?? p.avg ?? 0); };
  const rows = [];
  for (const c of candidates) {
    const its = cache[c.contract_id].items;
    const got = its.filter(x => x[2]), want = its.filter(x => !x[2]);
    const bpcs = got.filter(x => x[3]);
    if (bpcs.length && !o.includeBpc && bpcs.length === got.length) continue;
    const sellVal = got.reduce((n, [t, q, , bpc]) => n + (bpc ? 0 : P(t, 'sell') * q), 0);
    const buyVal = got.reduce((n, [t, q, , bpc]) => n + (bpc ? 0 : P(t, 'buy') * q), 0);
    const wantCost = want.reduce((n, [t, q]) => n + P(t, 'sell') * q, 0);
    const cost = c.price + wantCost;
    const profitBuy = buyVal - cost, profitSell = sellVal - cost;
    if (profitSell < minProfit || profitSell / Math.max(1, sellVal) < minPct) continue;
    const top = got.filter(x => !x[3]).map(([t, q]) => ({ id: t, name: (sde.type(t) || {}).name || String(t), qty: q, value: P(t, 'sell') * q })).sort((a, b) => b.value - a.value);
    rows.push({ id: c.contract_id, title: c.title || '', price: c.price, wantCost, sellVal, buyVal, profitSell, profitBuy, pct: profitSell / Math.max(1, sellVal),
      items: top.slice(0, 4), itemCount: got.length, wants: want.length, bpcs: bpcs.length, issued: c.date_issued, expires: c.date_expired, issuerId: c.issuer_id,
      all: got.map(([t, q, , bpc, runs]) => ({ id: t, name: (sde.type(t) || {}).name || String(t), qty: q, bpc: !!bpc, runs: runs || 0, sell: bpc ? 0 : P(t, 'sell') * q, buy: bpc ? 0 : P(t, 'buy') * q })).sort((a, b) => b.sell - a.sell),
      want: want.map(([t, q]) => ({ id: t, name: (sde.type(t) || {}).name || String(t), qty: q, sell: P(t, 'sell') * q })),
      locationId: c.start_location_id, volume: c.volume, suspicious: profitSell / Math.max(1, sellVal) > 0.7 || want.length > 0 });
  }
  // locations for the shortlist
  for (const r of rows.slice(0, 80)) {
    const l = await couriers.locate(r.locationId).catch(() => null);
    if (l) { const s = sde.system(l.systemId); r.location = l.name; r.system = s ? s.name : null; r.security = s ? s.security : null; }
  }
  let out = rows;
  if (o.highsecOnly) out = out.filter(r => r.security !== null && r.security !== undefined && Math.round(r.security * 10) / 10 >= 0.5);
  out.sort((a, b) => b.profitSell - a.profitSell);
  return { regionId, total: list.length, read: known.length, newlyRead: todo.length - failed, unread: list.length - known.length, failed, rows: out.slice(0, 100) };
}

const itemsTuple = r => (r || []).slice(0, 300).map(x => [x.type_id, x.quantity, x.is_included ? 1 : 0, x.is_blueprint_copy ? 1 : 0, x.runs || 0, x.material_efficiency ?? null, x.time_efficiency ?? null]);

// Main trade regions for blueprint contracts
const BP_REGIONS = { 10000002: 'The Forge', 10000043: 'Domain', 10000032: 'Sinq Laison', 10000042: 'Metropolis', 10000030: 'Heimatar' };
const bpStatus = { phase: '', done: 0, total: 0 };

/**
 * Blueprints for sale on public contracts. A contract holding just one blueprint has a volume of 0.01 m³,
 * so only those are opened. o: { query (blueprint or product name / typeId), regions: [ids] }
 */
async function blueprintOffers(o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  let want = Number(o.typeId) || null;
  if (!want && o.query) {
    const q = String(o.query).trim();
    want = sde.typeIdByName(q) || sde.typeIdByName(q + ' Blueprint') || sde.typeIdByName(q.replace(/ Blueprint$/i, ''));
  }
  if (!want) throw new Error('Type a blueprint or item name, e.g. "Hammerhead II Blueprint" or "Raven".');
  // product → its blueprint
  const bi = sde.blueprintFor(want); const bpId = bi ? bi.blueprintId : want;
  const bpType = sde.type(bpId) || {};
  if (!/blueprint|formula/i.test(bpType.name || '') && !bi) throw new Error('That isn\'t a blueprint, and nothing has a blueprint that makes it.');
  const regions = (o.regions && o.regions.length ? o.regions : Object.keys(BP_REGIONS)).map(Number);
  const cache = itemCache(); prune();
  const now = Date.now();
  const lists = [];
  bpStatus.phase = 'lists'; bpStatus.done = 0; bpStatus.total = regions.length;
  for (const rid of regions) { const l = await safe(() => regionContracts(rid)); bpStatus.done++; if (ok(l)) lists.push(...l.filter(c => c.type === 'item_exchange' && c.volume <= 0.0101 && Date.parse(c.date_expired) > now).map(c => ({ ...c, regionId: rid }))); }
  // Read the single-blueprint contracts not seen yet (old cache entries without ME/TE are read again)
  const todo = lists.filter(c => !cache[c.contract_id] || (cache[c.contract_id].items[0] && cache[c.contract_id].items[0].length < 7)).slice(0, o.maxNew || 1500);
  bpStatus.phase = 'items'; bpStatus.done = 0; bpStatus.total = todo.length;
  await pool(todo, 10, async c => {
    const r = await safe(() => get(`/contracts/public/items/${c.contract_id}/`));
    bpStatus.done++;
    if (ok(r)) cache[c.contract_id] = { exp: Date.parse(c.date_expired), items: itemsTuple(r) };
  });
  store.save('contractItems');
  const rows = [];
  for (const c of lists) {
    const it = cache[c.contract_id]; if (!it) continue;
    const got = it.items.filter(x => x[2]);
    if (got.length !== 1 || got[0][0] !== bpId || it.items.some(x => !x[2])) continue;
    const [, qty, , bpc, runs, me, te] = got[0];
    rows.push({ id: c.contract_id, price: c.price, bpc: !!bpc, runs: bpc ? runs : null, perRun: bpc && runs ? c.price / runs : null, me, te, qty, title: c.title || '', regionId: c.regionId, region: BP_REGIONS[c.regionId] || String(c.regionId),
      locationId: c.start_location_id, issued: c.date_issued, expires: c.date_expired, issuerId: c.issuer_id });
  }
  for (const r of rows.slice(0, 60)) { const l = await couriers.locate(r.locationId).catch(() => null); if (l) { const s2 = sde.system(l.systemId); r.location = l.name; r.system = s2 ? s2.name : null; r.security = s2 ? s2.security : null; } }
  const bpos = rows.filter(r => !r.bpc).sort((a, b) => a.price - b.price), bpcs = rows.filter(r => r.bpc).sort((a, b) => a.perRun - b.perRun);
  const median = a => { if (!a.length) return null; const s2 = [...a].sort((x, y) => x - y); return s2[Math.floor(s2.length / 2)]; };
  bpStatus.phase = '';
  // what the original costs from NPC sellers (blueprints with market orders)
  const npc = await safe(() => market.prices([bpId], 'Jita'));
  const productId = bi ? want : (sde.blueprint(bpId) && Object.values(sde.blueprint(bpId).a || {})[0] && (Object.values(sde.blueprint(bpId).a)[0].p || [])[0] || [])[0];
  return { blueprintId: bpId, blueprint: bpType.name, productId: productId || null, product: productId ? (sde.type(productId) || {}).name : null,
    market: ok(npc) && npc[bpId] ? npc[bpId] : null,
    summary: { bpoCheapest: bpos[0] ? bpos[0].price : null, bpoMedian: median(bpos.map(r => r.price)), bpcPerRunMedian: median(bpcs.map(r => r.perRun)), bpcPerRunCheapest: bpcs[0] ? bpcs[0].perRun : null, bpos: bpos.length, bpcs: bpcs.length },
    bpos: bpos.slice(0, 40), bpcs: bpcs.slice(0, 60), scanned: lists.length, read: todo.length, regions: regions.map(id => BP_REGIONS[id] || String(id)) };
}

module.exports = { scan, blueprintOffers, BP_REGIONS, bpStatus: () => ({ ...bpStatus }) };
