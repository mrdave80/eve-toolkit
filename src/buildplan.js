'use strict';
/* Industry helpers on top of the build calculator:
   - stock: what you already own of each material, across every pilot's hangars
   - whatToBuild: rank the products of your own blueprints by profit, capped by how much the market really buys */
const sde = require('./sde');
const store = require('./store');
const market = require('./market');
const industry = require('./industry');
const assetfinder = require('./assetfinder');
const extra = require('./esi-extra');

/** typeIds -> { typeId: { total, places: [{ pilot, location, system, qty }] } }, optionally only in one system. */
async function stock(typeIds, o = {}) {
  const want = new Set((typeIds || []).map(Number));
  const { rows } = await assetfinder.load(!!o.refresh);
  const sysId = o.system ? sde.systemIdByName(String(o.system)) : null;
  const out = {};
  for (const r of rows) {
    if (!want.has(r.typeId) || (sysId && r.systemId !== sysId)) continue;
    const x = out[r.typeId] = out[r.typeId] || { total: 0, places: [] };
    x.total += r.qty;
    const p = x.places.find(p => p.pilot === r.pilot && p.location === r.location);
    if (p) p.qty += r.qty; else x.places.push({ pilot: r.pilot, location: r.location, system: r.system, qty: r.qty });
  }
  for (const x of Object.values(out)) x.places.sort((a, b) => b.qty - a.qty);
  return out;
}

/** Leaf materials to buy for a calculate() result, after taking what you own. */
async function shoppingList(calc, o = {}) {
  const need = new Map();
  const walk = d => { for (const m of d.materials) { if (m.built) walk(m.built); else need.set(m.typeId, (need.get(m.typeId) || 0) + m.qty); } };
  walk(calc);
  const ids = [...need.keys()];
  const have = await stock([...ids, calc.blueprintId], o);
  const items = ids.map(id => {
    const t = sde.type(id) || {}; const n = need.get(id); const h = have[id] ? have[id].total : 0;
    const unit = (calc.materials.find(m => m.typeId === id) || {}).unit;
    return { typeId: id, name: t.name, need: n, have: Math.min(h, n), buy: Math.max(0, n - h), places: have[id] ? have[id].places.slice(0, 4) : [], unit: unit ?? null, volume: (t.volume || 0) * Math.max(0, n - h) };
  }).sort((a, b) => b.buy - a.buy || a.name.localeCompare(b.name));
  const bp = have[calc.blueprintId];
  return { items, ready: items.every(i => i.buy === 0), buyVolume: items.reduce((n, i) => n + i.volume, 0),
    blueprint: { name: calc.blueprint, have: !!(bp && bp.total), places: bp ? bp.places.slice(0, 3) : [] },
    multibuy: items.filter(i => i.buy > 0).map(i => `${i.name} ${i.buy}`).join('\n') };
}

/** Rank your blueprints' products. o: build settings (structure, rig, security, facilityTax, hub), salesTax %, brokerFee %, share (of daily market volume you could sell). */
async function whatToBuild(o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const chars = (store.get().characters || []).filter(c => !c.needsReauth && (c.scopes || []).includes('esi-characters.read_blueprints.v1'));
  if (!chars.length) throw new Error('No pilot has the blueprints permission. Re-authorise a pilot to read blueprints.');
  const best = new Map(); // product -> blueprint
  for (const c of chars) {
    let list; try { list = await extra.blueprints(c.id); } catch { continue; }
    for (const b of list) {
      const prod = sde.blueprint(b.typeId);
      if (!prod) continue;
      const act = prod.a.manufacturing || prod.a.reaction; if (!act || !act.p || !act.p.length) continue;
      const pid = act.p[0][0];
      const cur = best.get(pid);
      const score = (b.original ? 1000 : 0) + b.me * 10 + b.te / 2;
      if (!cur || score > cur.score) best.set(pid, { pid, bp: b, pilot: c.name, score });
    }
  }
  const list = [...best.values()].slice(0, Number(o.limit) || 80);
  const tax = ((o.salesTax ?? 3.37) + (o.brokerFee ?? 1.5)) / 100, share = (o.share ?? 10) / 100;
  const hub = o.hub || 'Jita';
  const rows = [];
  await market.pool(list, 4, async x => {
    try {
      const calc = await industry.calculate({ ...o, productTypeId: x.pid, runs: 1, me: x.bp.me, te: x.bp.te, build: [], hub });
      const hist = await market.history(x.pid, hub).catch(() => []);
      const recent = hist.slice(-30);
      const perDay = recent.length ? recent.reduce((n, h) => n + h.volume, 0) / 30 : 0;
      const unitProfit = calc.sellPrice * (1 - tax) - calc.unitCost;
      const runsPerDay = calc.seconds ? 86400 / calc.seconds : 0;
      const makePerDay = runsPerDay * calc.outQty;
      const canSell = perDay * share;
      const units = Math.min(makePerDay, canSell);
      rows.push({ typeId: x.pid, name: calc.product.name, blueprint: x.bp.name, original: x.bp.original, me: x.bp.me, te: x.bp.te, runs: x.bp.runs, pilot: x.pilot,
        unitCost: calc.unitCost, sell: calc.sellPrice, unitProfit, margin: calc.sellPrice ? unitProfit / calc.sellPrice : 0,
        jobHours: calc.seconds / 3600, outPerRun: calc.outQty, marketPerDay: Math.round(perDay), makePerDay: Math.round(makePerDay * 10) / 10,
        perDaySlot: unitProfit * units, capped: canSell < makePerDay });
    } catch { /* skip items we can't price */ }
  });
  rows.sort((a, b) => b.perDaySlot - a.perDaySlot);
  return { hub, share: share * 100, tax: tax * 100, rows, checked: list.length, total: best.size };
}

/** Build or sell, and blueprint payback, for one build calculator result.
    - Sell the materials instead: what the materials fetch at hub buy orders, against the build's profit.
    - Components: for each buildable material, the cost to build one against its sell price.
    - Payback: runs (and days of one slot) for the profit to cover the blueprint's price. */
async function buildVsSell(calc, o = {}) {
  const hub = o.hub || 'Jita';
  const ids = [...new Set([...calc.materials.map(m => m.typeId), calc.blueprintId])];
  const pr = await market.prices(ids, hub);
  const buy = id => { const x = pr[id] || {}; return x.buy ?? 0; }, sell = id => { const x = pr[id] || {}; return x.sell ?? x.avg ?? 0; };
  const matsSellValue = calc.materials.reduce((n, m) => n + m.qty * buy(m.typeId), 0);
  const taxRate = (Number(o.salesTax) || 4.5) / 100;
  const productNet = calc.revenueSell * (1 - taxRate) - calc.jobCost;   // sell orders, after sales tax and the job fee
  const materialsNet = matsSellValue * (1 - taxRate);
  const components = [];
  for (const m of calc.materials.filter(x => x.canBuild)) {
    const sub = m.built || await industry.calculate({ ...o, productTypeId: m.typeId, runs: Math.max(1, Math.ceil(m.qty / Math.max(1, (sde.blueprint(sde.blueprintFor(m.typeId).blueprintId).a[sde.blueprintFor(m.typeId).activity].p.find(p => p[0] === m.typeId) || [0, 1])[1]))), me: o.componentMe ?? 10, te: o.componentTe ?? 20, build: [] }).catch(() => null);
    if (!sub) continue;
    const unitBuild = sub.totalCost / sub.outQty;
    components.push({ typeId: m.typeId, name: m.name, qty: m.qty, unitBuild, unitSell: sell(m.typeId), unitBuy: buy(m.typeId), marginSell: sell(m.typeId) - unitBuild });
  }
  const bpPrice = Number(o.blueprintPrice) > 0 ? Number(o.blueprintPrice) : sell(calc.blueprintId);
  const perRun = calc.runs ? (calc.profitSell - calc.revenueSell * taxRate) / calc.runs : 0;
  const secsPerRun = calc.runs ? calc.seconds / calc.runs : 0;
  const runsToPay = perRun > 0 && bpPrice > 0 ? Math.ceil(bpPrice / perRun) : null;
  return {
    hub, salesTax: taxRate * 100,
    sellMaterials: { value: matsSellValue, net: materialsNet },
    buildIt: { net: productNet, gain: productNet - materialsNet },
    verdict: productNet - materialsNet > 0 ? 'build' : 'sell',
    components: components.sort((a, b) => b.marginSell * b.qty - a.marginSell * a.qty),
    payback: { blueprintPrice: bpPrice, priceFrom: Number(o.blueprintPrice) > 0 ? 'you' : bpPrice ? 'market' : null, profitPerRun: perRun, runs: runsToPay, days: runsToPay ? runsToPay * secsPerRun / 86400 : null, maxRuns: calc.maxRuns }
  };
}

module.exports = { stock, shoppingList, whatToBuild, buildVsSell };
