'use strict';
/* Moon scan value: paste survey probe results, get ISK per extraction and per 30 days. */
const sde = require('./sde');
const market = require('./market');

const rating = group => { for (const [re, r] of [[/exceptional/i, 'R64'], [/uncommon/i, 'R16'], [/rare/i, 'R32'], [/ubiquitous/i, 'R4'], [/common/i, 'R8']]) if (re.test(group || '')) return r; return null; };

/**
 * In-game survey scan copy looks like:
 *   Moon	Moon Product	Quantity	Ore TypeID	SolarSystemID	PlanetID	MoonID
 *   Tama VII - Moon 9
 *   	Bitumens	0.42	45492	30002813	40178372	40178386
 */
function parse(text) {
  const moons = new Map(); let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim() || /^\s*Moon\s+Moon Product/i.test(raw)) continue;
    const cols = raw.split('\t').map(c => c.trim());
    const nums = cols.filter(c => /^\d+(\.\d+)?$/.test(c));
    // product row: [ '', product, quantity, oreTypeId, systemId, planetId, moonId ]
    const typeId = Number(cols[3]); const qty = Number(cols[2]);
    if (cols.length >= 7 && typeId > 0 && qty > 0 && qty <= 1) {
      const moonId = Number(cols[6]) || (current && current.id) || 0;
      if (!moons.has(moonId)) moons.set(moonId, { id: moonId, name: current && (!current.id || current.id === moonId) ? current.name : String(moonId), systemId: Number(cols[4]) || null, products: [] });
      const m = moons.get(moonId); if (current && !current.id) { current.id = moonId; m.name = current.name; }
      m.products.push({ name: cols[1], typeId, share: qty });
      continue;
    }
    if (cols.length <= 2 && nums.length === 0) current = { name: cols[0] || cols[1], id: 0 };
  }
  return [...moons.values()].filter(m => m.products.length);
}

async function value(text, o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const moons = parse(text);
  if (!moons.length) throw new Error('No moon products found. In game, open the survey scan results, select them all, copy and paste here.');
  const m3h = Math.max(1000, Math.min(100000, Number(o.m3PerHour) || 20000));
  const yieldPct = Math.max(30, Math.min(100, Number(o.yieldPct) || 85)) / 100;
  const side = o.side === 'buy' ? 'buy' : 'sell';
  const days = Math.max(6, Math.min(56, Number(o.days) || 7));
  const oreIds = [...new Set(moons.flatMap(m => m.products.map(p => p.typeId)))];
  const matIds = [...new Set(oreIds.flatMap(id => (sde.reprocess(id) || []).map(([m]) => m)))];
  const prices = await market.prices([...oreIds, ...matIds], o.hub || 'Jita');
  const price = id => { const p = prices[id] || {}; return (side === 'buy' ? p.buy : p.sell) ?? p.avg ?? 0; };
  // ISK per m³ of each ore, refined and sold as ore
  const perM3 = {};
  for (const id of oreIds) {
    const t = sde.type(id) || {};
    const vol = t.volume || 10, portion = t.portionSize || 100;
    const mats = sde.reprocess(id) || [];
    const refinedPerUnit = mats.reduce((n, [m, q]) => n + q * yieldPct * price(m), 0) / portion;
    perM3[id] = { name: t.name, group: t.group, rating: rating(t.group), refined: refinedPerUnit / vol, ore: price(id) / vol,
      minerals: mats.map(([m, q]) => ({ name: (sde.type(m) || {}).name, perM3: q * yieldPct / portion / vol })) };
  }
  const month = m3h * 24 * 30, extraction = m3h * 24 * days;
  const rows = moons.map(m => {
    const products = m.products.map(p => {
      const v = perM3[p.typeId] || { refined: 0, ore: 0 };
      const best = Math.max(v.refined, v.ore);
      return { ...p, name: v.name || p.name, rating: v.rating, iskPerM3Refined: v.refined, iskPerM3Ore: v.ore, iskPerM3: best, sellAs: v.refined >= v.ore ? 'refined' : 'ore',
        monthIsk: best * p.share * month, minerals: v.minerals || [] };
    });
    const sys = m.systemId ? sde.system(m.systemId) : null;
    const rank = r => { const i = ['R64', 'R32', 'R16', 'R8', 'R4'].indexOf(r); return i < 0 ? 99 : i; };
    const top = products.reduce((b, p) => (!b || rank(p.rating) < rank(b.rating) ? p : b), null);
    const iskPerM3 = products.reduce((n, p) => n + p.iskPerM3 * p.share, 0);
    return { id: m.id, name: m.name, system: sys ? sys.name : null, security: sys ? sys.security : null, region: sys ? sys.region : null, rating: top && top.rating, products: products.sort((a, b) => b.monthIsk - a.monthIsk),
      share: products.reduce((n, p) => n + p.share, 0), iskPerM3, monthIsk: iskPerM3 * month, extractionIsk: iskPerM3 * extraction };
  }).sort((a, b) => b.monthIsk - a.monthIsk);
  return { moons: rows, opts: { m3PerHour: m3h, yieldPct: yieldPct * 100, side, days, hub: o.hub || 'Jita' } };
}

module.exports = { parse, value, _t: { rating } };
