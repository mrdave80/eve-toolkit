'use strict';
/* Trade profit tracker: matches each sale to the buys before it (first in, first out) across your pilots,
   after sales tax and broker fees. ESI only returns about the last 30 days, so the app keeps its own
   ledger and it grows each time the page or the background check reads it. */
const store = require('./store');
const esi = require('./esi');
const sde = require('./sde');
const { get, getAllPages, safe, ok } = esi;

const MAX_TX = 25000;      // per pilot, kept on this PC
const DAY = 86400000;

function ledger() { const d = store.get(); d.trade = d.trade || { tx: {}, fees: {}, at: {} }; return d.trade; }

/** Pull new transactions and fee journal lines for each pilot into the local ledger. */
async function sync(charIds) {
  const L = ledger(); const errors = [];
  for (const id of charIds) {
    const [tx, jr] = await Promise.all([
      safe(() => get(`/characters/${id}/wallet/transactions/`, id)),
      safe(() => getAllPages(`/characters/${id}/wallet/journal/`, id, 10))
    ]);
    if (!ok(tx)) { errors.push({ id, error: tx.__error }); continue; }
    const have = L.tx[id] || [];
    const seen = new Set(have.map(t => t[0]));
    for (const t of tx) {
      if (seen.has(t.transaction_id)) continue;
      // [id, time, typeId, qty, unitPrice, isBuy, locationId, isPersonal, journalRefId]
      have.push([t.transaction_id, Date.parse(t.date), t.type_id, t.quantity, t.unit_price, t.is_buy ? 1 : 0, t.location_id, t.is_personal ? 1 : 0, t.journal_ref_id || 0]);
    }
    have.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    L.tx[id] = have.slice(-MAX_TX);
    if (ok(jr)) {
      const f = L.fees[id] || [];
      const fs = new Set(f.map(x => x[0]));
      for (const e of jr) {
        if (!['transaction_tax', 'brokers_fee'].includes(e.ref_type) || fs.has(e.id)) continue;
        f.push([e.id, Date.parse(e.date), e.ref_type === 'transaction_tax' ? 't' : 'b', e.amount, e.context_id || 0]);
      }
      f.sort((a, b) => a[1] - b[1]);
      L.fees[id] = f.slice(-MAX_TX);
    }
    L.at[id] = Date.now();
  }
  store.save('trade');
  return errors;
}

/**
 * opts: { charIds, days, pooled (match across pilots, default true) }
 */
async function report(o = {}) {
  const d = store.get();
  const ids = (o.charIds && o.charIds.length ? o.charIds : (d.characters || []).map(c => c.id)).map(Number);
  const errors = await sync(ids);
  const L = ledger();
  const days = Math.max(1, Math.min(365, Number(o.days) || 30));
  const since = Date.now() - days * DAY;
  const pooled = o.pooled !== false;
  const wac = o.method === 'wac';
  const ex = exclusions();
  const exTx = new Set(ex.tx), exLoc = new Set(ex.loc), exType = new Set(ex.type);

  // Sales tax entries point at the transaction (context_id); broker fees point at orders, so they're counted per day.
  const taxByTx = new Map(); let brokerIn = 0, taxIn = 0;
  const feeDays = new Map();
  for (const id of ids) for (const [, t, kind, amt, ctx] of (L.fees[id] || [])) {
    if (kind === 't' && ctx) taxByTx.set(ctx, (taxByTx.get(ctx) || 0) + Math.abs(amt));
    if (t < since) continue;
    if (kind === 'b') brokerIn += Math.abs(amt); else taxIn += Math.abs(amt);
    const day = new Date(t).toISOString().slice(0, 10);
    const dd = feeDays.get(day) || { broker: 0, tax: 0 }; if (kind === 'b') dd.broker += Math.abs(amt); else dd.tax += Math.abs(amt); feeDays.set(day, dd);
  }

  // Transactions in time order; lots per type (per pilot unless pooled).
  const all = [];
  let excluded = 0;
  for (const id of ids) for (const t of (L.tx[id] || [])) if (t[7]) {
    if (exTx.has(t[0]) || exLoc.has(t[6]) || exType.has(t[2])) { if (t[1] >= since) excluded++; continue; }
    all.push({ charId: id, id: t[0], time: t[1], typeId: t[2], qty: t[3], price: t[4], buy: !!t[5], loc: t[6] });
  }
  all.sort((a, b) => a.time - b.time || a.id - b.id);
  const lots = new Map();
  const items = new Map(); const daysMap = new Map();
  let unmatchedQty = 0, unmatchedIsk = 0;
  const styles = { station: { profit: 0, revenue: 0, trades: 0 }, haul: { profit: 0, revenue: 0, trades: 0 } };
  const locStats = new Map();
  for (const t of all) {
    const key = (pooled ? '' : t.charId + ':') + t.typeId;
    if (t.time >= since) { const ls = locStats.get(t.loc) || { id: t.loc, buys: 0, sells: 0, isk: 0 }; if (t.buy) ls.buys++; else ls.sells++; ls.isk += t.qty * t.price; locStats.set(t.loc, ls); }
    if (t.buy) {
      if (wac) {
        // weighted average cost: one pool per item, its average moves with every buy
        const p = lots.get(key) || lots.set(key, { qty: 0, avg: 0, time: t.time, locs: new Set(), charId: t.charId, id: t.id }).get(key);
        if (!p.qty) { p.locs = new Set(); p.time = t.time; }
        p.avg = (p.avg * p.qty + t.price * t.qty) / (p.qty + t.qty); p.qty += t.qty; p.locs.add(t.loc); p.charId = t.charId; p.id = t.id;
      } else (lots.get(key) || lots.set(key, []).get(key)).push({ qty: t.qty, price: t.price, time: t.time, charId: t.charId, loc: t.loc, id: t.id });
      continue;
    }
    // sale: take from the oldest lots (or the average pool)
    let need = t.qty, cost = 0, matched = 0, held = 0; const used = [];
    let station = true;
    if (wac) {
      const p = lots.get(key);
      if (p && p.qty) {
        const n = Math.min(need, p.qty);
        cost = n * p.avg; matched = n; held = n * (t.time - p.time); need -= n; p.qty -= n;
        used.push({ qty: n, price: p.avg, time: p.time, charId: p.charId, avg: true });
        station = [...p.locs].every(l => l === t.loc);
      }
    } else {
      const q = lots.get(key) || [];
      while (need > 0 && q.length) {
        const lot = q[0]; const n = Math.min(need, lot.qty);
        cost += n * lot.price; matched += n; held += n * (t.time - lot.time); used.push({ qty: n, price: lot.price, time: lot.time, charId: lot.charId, id: lot.id, loc: lot.loc });
        if (lot.loc !== t.loc) station = false;
        lot.qty -= n; need -= n; if (!lot.qty) q.shift();
      }
    }
    if (t.time < since) continue;
    const revenue = matched * t.price;
    const tax = taxByTx.has(t.id) ? taxByTx.get(t.id) * (matched / t.qty) : 0;
    const profit = revenue - cost - tax;
    if (need > 0) { unmatchedQty += need; unmatchedIsk += need * t.price; }
    if (matched) { const st = styles[station ? 'station' : 'haul']; st.profit += profit; st.revenue += revenue; st.trades++; }
    const it = items.get(t.typeId) || { typeId: t.typeId, sold: 0, revenue: 0, cost: 0, tax: 0, profit: 0, trades: 0, unmatched: 0, heldMs: 0, bought: 0, spent: 0 };
    if (!it.matches) { it.matches = []; it.byPilot = {}; }
    it.matches.push({ id: t.id, loc: t.loc, time: t.time, charId: t.charId, qty: t.qty, matched, price: t.price, lots: used.slice(0, 4), moreLots: Math.max(0, used.length - 4), cost, tax, profit, style: matched ? (station ? 'station' : 'haul') : null });
    it.style = it.style || { station: 0, haul: 0 }; if (matched) it.style[station ? 'station' : 'haul'] += profit;
    const bp = it.byPilot[t.charId] || (it.byPilot[t.charId] = { sold: 0, revenue: 0, profit: 0 }); bp.sold += matched; bp.revenue += revenue; bp.profit += profit;
    it.sold += matched; it.revenue += revenue; it.cost += cost; it.tax += tax; it.profit += profit; it.trades++; it.unmatched += need; it.heldMs += held;
    items.set(t.typeId, it);
    if (matched) {
      const day = new Date(t.time).toISOString().slice(0, 10);
      const dd = daysMap.get(day) || { day, revenue: 0, profit: 0 }; dd.revenue += revenue; dd.profit += profit; daysMap.set(day, dd);
    }
  }
  // buys in the period (what you spent), for context
  for (const t of all) if (t.buy && t.time >= since) { const it = items.get(t.typeId) || { typeId: t.typeId, sold: 0, revenue: 0, cost: 0, tax: 0, profit: 0, trades: 0, unmatched: 0, heldMs: 0, bought: 0, spent: 0 }; it.bought += t.qty; it.spent += t.qty * t.price; items.set(t.typeId, it); }
  // open stock: lots still held, valued at what you paid
  let stockIsk = 0; const stock = new Map();
  for (const [key, q] of lots) { const typeId = Number(String(key).split(':').pop()); for (const l of (wac ? [{ qty: q.qty, price: q.avg }] : q)) { stockIsk += l.qty * l.price; stock.set(typeId, (stock.get(typeId) || 0) + l.qty); } }

  const name = id => (sde.ready() && (sde.type(id) || {}).name) || ('Type ' + id);
  const cname = id => ((d.characters || []).find(c => c.id === id) || {}).name || String(id);
  const rows = [...items.values()].map(it => ({ ...it,
    matches: (it.matches || []).slice(-30).reverse().map(m => ({ ...m, time: new Date(m.time).toISOString(), seller: cname(m.charId), lots: m.lots.map(l => ({ ...l, time: new Date(l.time).toISOString(), buyer: cname(l.charId) })) })),
    pilots: Object.entries(it.byPilot || {}).map(([id, v]) => ({ id: Number(id), name: cname(Number(id)), ...v })).sort((a, b) => b.profit - a.profit), byPilot: undefined, name: name(it.typeId), margin: it.revenue ? it.profit / it.revenue : null, avgHoldDays: it.sold ? it.heldMs / it.sold / DAY : null, stock: stock.get(it.typeId) || 0 }));
  const sold = rows.filter(r => r.sold > 0);
  const gross = sold.reduce((n, r) => n + r.profit, 0);
  const matchedTax = sold.reduce((n, r) => n + r.tax, 0);
  const net = gross - brokerIn - Math.max(0, taxIn - matchedTax);   // tax not linked to a matched sale still counts
  const dayRows = [...daysMap.values()];
  for (const [day, f] of feeDays) { const dd = dayRows.find(x => x.day === day) || (dayRows.push({ day, revenue: 0, profit: 0 }), dayRows[dayRows.length - 1]); dd.broker = f.broker; }
  for (const dd of dayRows) dd.net = dd.profit - (dd.broker || 0);
  dayRows.sort((a, b) => a.day.localeCompare(b.day));
  const oldest = Math.min(...ids.map(id => ((L.tx[id] || [])[0] || [0, Infinity])[1]));
  // where you trade, for the exclusion list
  const rw = require('./routewatch');
  const topLocs = [...locStats.values()].sort((a, b) => b.isk - a.isk).slice(0, 12);
  for (const l of topLocs) l.name = (await rw.stationName(l.id).catch(() => null)) || (l.id >= 1e12 ? 'Structure ' + l.id : 'Station ' + l.id);
  const exLocs = [];
  for (const id of ex.loc) exLocs.push({ id, name: (await rw.stationName(id).catch(() => null)) || 'Location ' + id });
  return {
    days, pooled, errors, method: wac ? 'wac' : 'fifo', styles, locations: topLocs,
    excluded: { count: excluded, tx: ex.tx.length, loc: exLocs, type: ex.type.map(id => ({ id, name: name(id) })) },
    totals: { revenue: sold.reduce((n, r) => n + r.revenue, 0), cost: sold.reduce((n, r) => n + r.cost, 0), salesTax: taxIn, broker: brokerIn, gross, net,
      perDay: net / days, unmatchedQty, unmatchedIsk, stockIsk, trades: sold.reduce((n, r) => n + r.trades, 0) },
    items: rows.sort((a, b) => b.profit - a.profit), daily: dayRows,
    ledgerFrom: isFinite(oldest) ? new Date(oldest).toISOString() : null, ledgerCount: ids.reduce((n, id) => n + (L.tx[id] || []).length, 0)
  };
}

function exclusions() { const L = ledger(); L.exclude = L.exclude || { tx: [], loc: [], type: [] }; return L.exclude; }
/** Leave a transaction, a location or an item out of profit (for gifts, moves between your own pilots, odd one-offs). */
function setExclude(kind, id, on) {
  const ex = exclusions();
  if (kind === 'alltx') { ex.tx = []; store.save('trade'); return ex; }
  const k = { tx: 'tx', loc: 'loc', type: 'type' }[kind];
  if (!k) throw new Error('Unknown exclusion');
  id = Number(id);
  ex[k] = ex[k].filter(x => x !== id); if (on) ex[k].push(id);
  if (ex[k].length > 5000) ex[k] = ex[k].slice(-5000);
  store.save('trade');
  return ex;
}

module.exports = { sync, report, setExclude };
