'use strict';
/* Station-trading margin scanner: every item at a trade hub where buying with a buy order and
   reselling with a sell order in the same station clears your fees, filtered by how much it
   actually trades each day. Fees come from a pilot's Accounting and Broker Relations skills. */
const esi = require('./esi');
const market = require('./market');
const sde = require('./sde');
const { safe, ok } = esi;

const ACCOUNTING = 16622, BROKER_RELATIONS = 3446;
const BASE_TAX = 7.5, BASE_BROKER = 3.0;

/** Sales tax and broker fee (%) for a pilot, from their skills. Standings also lower broker fees; set them by hand if yours are high. */
async function feesFor(charId) {
  if (!charId) return { salesTax: BASE_TAX * (1 - 0.11 * 5), brokerFee: BASE_BROKER - 0.3 * 5, from: 'All skills at V' };
  const s = await safe(() => esi.get(`/characters/${charId}/skills/`, charId));
  if (!ok(s)) return { salesTax: BASE_TAX * (1 - 0.11 * 5), brokerFee: BASE_BROKER - 0.3 * 5, from: 'Skills unavailable, assuming V' };
  const lvl = id => ((s.skills || []).find(k => k.skill_id === id) || {}).active_skill_level || 0;
  const acc = lvl(ACCOUNTING), br = lvl(BROKER_RELATIONS);
  return { salesTax: +(BASE_TAX * (1 - 0.11 * acc)).toFixed(3), brokerFee: +(BASE_BROKER - 0.3 * br).toFixed(2), accounting: acc, brokerRelations: br, from: `Accounting ${acc}, Broker Relations ${br}` };
}

const bookCache = new Map();   // region -> { at, orders }
const status = { phase: '', done: 0, total: 0 };

/**
 * o: { hub, charId, salesTax, brokerFee, minMargin (%), minVolume (units a day), minProfit (ISK a day), maxPrice, share (% of daily volume you'd get), limit }
 */
async function scan(o = {}) {
  const h = market.HUBS[o.hub] || market.HUBS.Jita;
  const fees = await feesFor(o.charId);
  const tax = (o.salesTax ?? fees.salesTax) / 100, broker = (o.brokerFee ?? fees.brokerFee) / 100;
  const minMargin = (o.minMargin ?? 5) / 100, minVol = o.minVolume ?? 20, share = (o.share ?? 10) / 100;
  const maxPrice = o.maxPrice || Infinity, minProfit = o.minProfit ?? 1e6;

  // Whole-region order book, cached for 10 minutes (it's a few hundred pages for The Forge)
  let hit = bookCache.get(h.region);
  if (!hit || Date.now() - hit.at > 10 * 60000 || o.refresh) {
    status.phase = 'orders'; status.done = 0; status.total = 0;
    const orders = await esi.getPagesParallel(`/markets/${h.region}/orders/?order_type=all`, 500, 10, (d, t) => { status.done = d; status.total = t; });
    hit = { at: Date.now(), orders }; bookCache.set(h.region, hit);
  }
  // Best prices in the station (buy orders with a range covering it count too)
  const best = new Map();
  for (const x of hit.orders) {
    const atStation = x.location_id === h.station;
    if (!x.is_buy_order && !atStation) continue;
    if (x.is_buy_order && !(atStation || x.range === 'region' || (x.system_id === h.system && x.range !== 'station'))) continue;
    const b = best.get(x.type_id) || { buy: 0, sell: Infinity, buyOrders: 0, sellOrders: 0 };
    if (x.is_buy_order) { if (x.price > b.buy) b.buy = x.price; b.buyOrders++; } else { if (x.price < b.sell) b.sell = x.price; b.sellOrders++; }
    best.set(x.type_id, b);
  }
  // Profit per unit if you buy at best buy +0.01 and sell at best sell −0.01
  const cands = [];
  for (const [typeId, b] of best) {
    if (!b.buy || !isFinite(b.sell) || b.sell <= b.buy || b.buy > maxPrice) continue;
    const buyAt = b.buy + 0.01, sellAt = b.sell - 0.01;
    const per = sellAt * (1 - tax - broker) - buyAt * (1 + broker);
    const margin = per / buyAt;
    if (margin < minMargin || per <= 0) continue;
    cands.push({ typeId, buy: b.buy, sell: b.sell, per, margin, buyOrders: b.buyOrders, sellOrders: b.sellOrders });
  }
  // Volume from market history for the most promising (history is one request per item)
  cands.sort((a, b) => b.per * Math.sqrt(b.margin) - a.per * Math.sqrt(a.margin));
  const check = cands.slice(0, o.depth || 150);
  status.phase = 'history'; status.done = 0; status.total = check.length;
  await market.pool(check, 10, async c => {
    const r = await safe(() => market.history(c.typeId, o.hub || 'Jita'));
    status.done++;
    if (!ok(r) || !r.length) return;
    const last = r.slice(-14);
    c.volume = last.reduce((n, d) => n + d.volume, 0) / last.length;
    c.orders = last.reduce((n, d) => n + d.order_count, 0) / last.length;
    c.avgPrice = last.reduce((n, d) => n + d.average, 0) / last.length;
    const prev = r.slice(-44, -14); const prevAvg = prev.length ? prev.reduce((n, d) => n + d.average, 0) / prev.length : c.avgPrice;
    c.trend = prevAvg ? (c.avgPrice - prevAvg) / prevAvg : 0;
    c.spark = r.slice(-30).map(d => Math.round(d.average * 100) / 100);
  });
  const name = id => (sde.ready() && (sde.type(id) || {}).name) || ('Type ' + id);
  const rows = check.filter(c => c.volume >= minVol).map(c => {
    const units = Math.max(1, Math.floor(c.volume * share));
    const daily = units * c.per;
    // competition: how many orders you'd be fighting on each side
    return { ...c, name: name(c.typeId), group: sde.ready() ? ((sde.type(c.typeId) || {}).group || '') : '', units, daily, capital: units * c.buy,
      // the history average sitting outside the spread means one side is mispriced: worth a look, not a sure thing
      odd: c.avgPrice && (c.avgPrice < c.buy * 0.8 || c.avgPrice > c.sell * 1.25) };
  }).filter(r => r.daily >= minProfit).sort((a, b) => b.daily - a.daily).slice(0, o.limit || 100);
  status.phase = '';
  return { hub: o.hub || 'Jita', station: h.label, fees: { ...fees, salesTax: tax * 100, brokerFee: broker * 100 }, scanned: best.size, candidates: cands.length, checked: check.length, rows, at: new Date(hit.at).toISOString() };
}

module.exports = { scan, feesFor, status: () => ({ ...status }) };
