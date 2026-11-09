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
    // [typeId, qty, included, bpc, runs]
    cache[c.contract_id] = { exp: Date.parse(c.date_expired), items: (r || []).slice(0, 300).map(x => [x.type_id, x.quantity, x.is_included ? 1 : 0, x.is_blueprint_copy ? 1 : 0, x.runs || 0]) };
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

module.exports = { scan };
