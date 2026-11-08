// Trading tools: LP store ISK/LP, hub arbitrage, undercut checks across pilots.
const sde = require('./sde');
const market = require('./market');
const store = require('./store');
const { get, getAllPages, safe, ok, marketPrices, resolveNames } = require('./esi');

const WATCHLIST = ['Tritanium', 'Pyerite', 'Mexallon', 'Isogen', 'Nocxium', 'Zydrine', 'Megacyte', 'Morphite', 'Nanite Repair Paste',
  'Large Skill Injector', 'Skill Extractor', 'Hammerhead II', 'Hobgoblin II', 'Warrior II', 'Ogre II', 'Valkyrie II', 'Acolyte II',
  'Damage Control II', 'Multispectrum Energized Membrane II', 'Medium Armor Repairer II', 'Large Shield Extender II', 'Medium Shield Extender II',
  '10MN Afterburner II', '50MN Microwarpdrive II', '5MN Microwarpdrive II', 'Warp Scrambler II', 'Warp Disruptor II', 'Stasis Webifier II',
  'Drone Damage Amplifier II', 'Gyrostabilizer II', 'Heat Sink II', 'Magnetic Field Stabilizer II', 'Ballistic Control System II',
  'Antimatter Charge M', 'Hail M', 'Void M', 'Scourge Heavy Missile', 'Mjolnir Heavy Missile', 'Scourge Rage Heavy Assault Missile',
  'Nanofiber Internal Structure II', 'Overdrive Injector System II', 'Capacitor Power Relay II', 'Cap Recharger II', 'Medium Capacitor Booster II',
  'Strontium Clathrates', 'Liquid Ozone', 'Heavy Water', 'Helium Isotopes', 'Nitrogen Isotopes', 'Oxygen Isotopes', 'Hydrogen Isotopes',
  'Exotic Dancers, Female', 'Mobile Depot', 'Mobile Tractor Unit', 'Interdiction Sphere Launcher I', 'Cynosural Field Generator I',
  'Rifter', 'Thrasher', 'Catalyst', 'Venture', 'Procurer', 'Retriever', 'Vexor', 'Drake', 'Hurricane', 'Myrmidon', 'Gila', 'Ishtar', 'Sabre', 'Heron', 'Buzzard', 'Astero'];

async function lpStore(corporationId, hub = 'Jita', lpBalance = null) {
  const offers = await get(`/loyalty/stores/${corporationId}/offers/`);
  const avg = await marketPrices();
  const val = (id, q) => (avg.get(id) || 0) * q;
  let rows = offers.map(o => {
    const req = (o.required_items || []).reduce((n, r) => n + val(r.type_id, r.quantity), 0);
    const out = val(o.type_id, o.quantity);
    const profit = out - o.isk_cost - req;
    return { offerId: o.offer_id, typeId: o.type_id, quantity: o.quantity, lp: o.lp_cost, isk: o.isk_cost, required: o.required_items || [], reqCost: req, value: out, iskPerLp: o.lp_cost ? profit / o.lp_cost : 0, priced: 'avg' };
  });
  rows.sort((a, b) => b.iskPerLp - a.iskPerLp);
  // Refine the best 40 with live hub prices (sell into buy orders = realistic)
  const top = rows.slice(0, 40);
  const ids = new Set();
  top.forEach(r => { ids.add(r.typeId); r.required.forEach(x => ids.add(x.type_id)); });
  const live = await market.prices([...ids], hub);
  for (const r of top) {
    const p = live[r.typeId] || {};
    const unitSell = p.sell ?? null, unitBuy = p.buy ?? null;
    const req = r.required.reduce((n, x) => n + ((live[x.type_id] || {}).sell ?? avg.get(x.type_id) ?? 0) * x.quantity, 0);
    r.reqCost = req;
    r.valueSell = unitSell !== null ? unitSell * r.quantity : null;
    r.valueBuy = unitBuy !== null ? unitBuy * r.quantity : null;
    r.iskPerLpSell = r.valueSell !== null ? (r.valueSell - r.isk - req) / r.lp : null;
    r.iskPerLpBuy = r.valueBuy !== null ? (r.valueBuy - r.isk - req) / r.lp : null;
    r.volume = ((live[r.typeId] || {}).buyVolume || 0);
    r.priced = 'hub';
  }
  rows.sort((a, b) => (b.iskPerLpBuy ?? b.iskPerLp) - (a.iskPerLpBuy ?? a.iskPerLp));
  const names = sde.ready() ? null : await resolveNames(rows.map(r => r.typeId));
  for (const r of rows) r.name = sde.ready() ? (sde.type(r.typeId) || {}).name : names[r.typeId];
  return { corporationId, rows, lpBalance };
}

async function arbitrage(names, fromHub, toHub, taxPct = 3.6) {
  const ids = (names && names.length ? names : WATCHLIST).map(n => typeof n === 'number' ? n : sde.typeIdByName(n)).filter(Boolean);
  const [a, b] = await Promise.all([market.prices(ids, fromHub), market.prices(ids, toHub)]);
  const tax = taxPct / 100;
  const rows = ids.map(id => {
    const t = sde.type(id) || { name: id, volume: 0 };
    const cost = a[id] && a[id].sell;
    const relist = b[id] && b[id].sell, instant = b[id] && b[id].buy;
    if (!cost) return null;
    const pInstant = instant ? instant * (1 - tax) - cost : null;
    const pRelist = relist ? relist * (1 - tax) - cost : null;
    return { typeId: id, name: t.name, volume: t.volume, buyAt: cost, sellRelist: relist, sellInstant: instant,
      profitInstant: pInstant, profitRelist: pRelist, marginRelist: pRelist !== null ? pRelist / cost : null,
      perM3: pRelist !== null && t.volume ? pRelist / t.volume : null, depth: b[id] ? b[id].buyVolume : 0 };
  }).filter(Boolean).sort((x, y) => (y.marginRelist ?? -9) - (x.marginRelist ?? -9));
  return { fromHub, toHub, rows };
}

async function myOrders() {
  const chars = store.get().characters.filter(c => !c.needsReauth);
  const all = [];
  for (const c of chars) {
    const r = await safe(() => get(`/characters/${c.id}/orders/`, c.id));
    if (ok(r)) for (const o of r) all.push({ ...o, charId: c.id, charName: c.name });
  }
  const uc = await market.undercuts(all);
  const byId = new Map(uc.map(u => [u.orderId, u]));
  const names = await resolveNames(all.flatMap(o => [o.type_id, o.location_id]));
  return all.map(o => ({ ...o, typeName: names[o.type_id], locationName: names[o.location_id], check: byId.get(o.order_id) || null }))
    .sort((x, y) => ((y.check && y.check.beaten) ? 1 : 0) - ((x.check && x.check.beaten) ? 1 : 0));
}

module.exports = { lpStore, arbitrage, myOrders, WATCHLIST };
