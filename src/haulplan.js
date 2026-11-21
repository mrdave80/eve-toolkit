'use strict';
/* Haul planner: pack items into trips for a ship's cargo hold, most ISK per m³ first, so the first
   trips carry what matters most. A trip can be capped at a value (stacks are split to stay under it),
   and any trip over the warning value is flagged: that's what gankers look for on cargo scans. */

/**
 * items: [{ typeId, name, qty, value (whole stack), volume (whole stack) }]
 * o: { cargo (m³), maxValue (ISK a trip, 0 = no cap), warnValue (ISK) }
 */
function plan(items, o = {}) {
  const cargo = Number(o.cargo) || 0;
  if (cargo <= 0) throw new Error('Enter the cargo hold size in m³.');
  const cap = Number(o.maxValue) > 0 ? Number(o.maxValue) : Infinity;
  const warn = Number(o.warnValue) > 0 ? Number(o.warnValue) : Infinity;
  const stacks = items.filter(i => i.qty > 0).map(i => ({ ...i, unitVol: i.volume / i.qty, unitVal: i.value / i.qty }))
    .map(i => ({ ...i, density: i.unitVol > 0 ? i.unitVal / i.unitVol : Infinity }))
    .sort((a, b) => b.density - a.density);
  const tooBig = stacks.filter(i => i.unitVol > cargo);
  const pricey = stacks.filter(i => i.unitVol <= cargo && i.unitVal > cap);
  let left = stacks.filter(i => i.unitVol <= cargo && i.unitVal <= cap).map(i => ({ ...i, rem: i.qty }));
  const trips = [];
  while (left.some(i => i.rem > 0) && trips.length < 500) {
    const t = { items: [], volume: 0, value: 0 };
    for (const i of left) {
      if (!i.rem) continue;
      const byVol = i.unitVol > 0 ? Math.floor((cargo - t.volume) / i.unitVol + 1e-9) : i.rem;
      const byVal = i.unitVal > 0 ? Math.floor((cap - t.value) / i.unitVal + 1e-9) : i.rem;
      const n = Math.min(i.rem, byVol, byVal);
      if (n <= 0) continue;
      t.items.push({ typeId: i.typeId, name: i.name, qty: n, volume: n * i.unitVol, value: n * i.unitVal });
      t.volume += n * i.unitVol; t.value += n * i.unitVal; i.rem -= n;
    }
    if (!t.items.length) break;
    t.full = t.volume / cargo; t.warn = t.value > warn; t.iskPerM3 = t.volume ? t.value / t.volume : 0;
    trips.push(t);
  }
  return {
    cargo, maxValue: cap === Infinity ? 0 : cap, warnValue: warn === Infinity ? 0 : warn, trips,
    total: { value: stacks.reduce((n, i) => n + i.value, 0), volume: stacks.reduce((n, i) => n + i.volume, 0) },
    tooBig: tooBig.map(i => ({ typeId: i.typeId, name: i.name, qty: i.qty, unitVol: i.unitVol })),
    tooPricey: pricey.map(i => ({ typeId: i.typeId, name: i.name, qty: i.qty, unitVal: i.unitVal })),
    // value of the first n trips: most of the ISK usually sits in a few
    cumulative: trips.reduce((acc, t) => { acc.push((acc[acc.length - 1] || 0) + t.value); return acc; }, [])
  };
}

module.exports = { plan };
