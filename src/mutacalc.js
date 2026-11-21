'use strict';
/* Mutaplasmid calculator: for a module, every mutaplasmid that fits it and the range each stat can roll
   (base value x the mutaplasmid's min and max). Enter the stats of a rolled module to see where each one
   landed, on the good side or the bad. */
const sde = require('./sde');
const market = require('./market');

function moduleOptions(q) {
  if (!sde.hasMutas()) throw new Error('This needs a game data update (Settings → Game data → Update), which adds CCP’s mutaplasmid data.');
  const id = Number(q) || sde.typeIdByName(String(q || ''));
  if (!id) throw new Error(`Nothing called "${q}".`);
  const mutas = sde.mutasFor(id);
  if (!mutas.length) throw new Error(`No mutaplasmid works on ${(sde.type(id) || {}).name || id}. Mutaplasmids fit tech I, meta, faction and some tech II modules and drones.`);
  const base = new Map((sde.fullAttrs(id) || []).map(a => [a.id, a]));
  return { id, name: (sde.type(id) || {}).name, base, mutas };
}

/** o: { module (name or id), values: { attributeId: rolled value } } */
async function calc(o = {}) {
  const m = moduleOptions(o.module);
  const ids = [m.id, ...m.mutas.map(x => x.id), ...m.mutas.map(x => x.resultingType).filter(Boolean)];
  const pr = await market.prices([...new Set(ids)], 'Jita').catch(() => ({}));
  const price = id => { const p = pr[id] || {}; return p.sell ?? p.avg ?? null; };
  const vals = o.values || {};
  const mutas = m.mutas.map(mu => {
    const rows = mu.attrs.map(([aid, lo, hi]) => {
      const a = m.base.get(aid);
      if (!a || typeof a.value !== 'number') return null;
      const v1 = a.value * lo, v2 = a.value * hi;
      const good = a.highIsGood ? Math.max(v1, v2) : Math.min(v1, v2), bad = a.highIsGood ? Math.min(v1, v2) : Math.max(v1, v2);
      const mine = !o.mutaId || Number(o.mutaId) === mu.id;
      const rolled = mine && vals[aid] !== undefined && vals[aid] !== '' ? Number(vals[aid]) : null;
      // 0 = worst possible roll, 1 = best
      const q = rolled !== null && good !== bad ? Math.max(0, Math.min(1, (rolled - bad) / (good - bad))) : null;
      const better = rolled !== null ? (a.highIsGood ? rolled > a.value : rolled < a.value) : null;
      return { id: aid, name: a.name, unit: a.unit, highIsGood: a.highIsGood, base: a.value, min: Math.min(v1, v2), max: Math.max(v1, v2), lo, hi, rolled, quality: q, better };
    }).filter(Boolean);
    const rolledRows = rows.filter(r => r.quality !== null);
    return { id: mu.id, name: mu.name, resultingType: mu.resultingType, resultingName: mu.resultingType ? (sde.type(mu.resultingType) || {}).name : null, price: price(mu.id), rows,
      quality: rolledRows.length ? rolledRows.reduce((s, r) => s + r.quality, 0) / rolledRows.length : null };
  });
  return { module: { id: m.id, name: m.name, price: price(m.id) }, mutas };
}

module.exports = { calc };
