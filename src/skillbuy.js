'use strict';
/* Skills to buy: skills in your pilots' skill plans that they haven't injected yet, with the book's
   Jita price and any copy of the book already in one of your hangars. */
const store = require('./store');
const sde = require('./sde');
const market = require('./market');
const skillplan = require('./skillplan');

async function list() {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const chars = (store.get().characters || []).filter(c => !c.needsReauth);
  const need = new Map(); // skillId -> { pilots: [{ id, name, plans }] }
  const errors = [];
  for (const c of chars) {
    const plans = skillplan.plans(c.id);
    if (!plans.length) continue;
    let st; try { st = await skillplan.charState(c.id); } catch (e) { errors.push({ pilot: c.name, error: e.message }); continue; }
    for (const p of plans) for (const e of p.entries || []) {
      if (st.levels.has(e.skillId)) continue;
      const n = need.get(e.skillId) || { skillId: e.skillId, pilots: new Map() };
      const pp = n.pilots.get(c.id) || { id: c.id, name: c.name, plans: new Set() };
      pp.plans.add(p.name || 'Plan'); n.pilots.set(c.id, pp); need.set(e.skillId, n);
    }
  }
  const ids = [...need.keys()];
  const prices = ids.length ? await market.prices(ids, 'Jita').catch(() => ({})) : {};
  // books already owned
  const owned = new Map();
  if (ids.length) {
    try { const a = await require('./assetfinder').load(false); for (const r of a.rows) if (need.has(r.typeId)) { const l = owned.get(r.typeId) || []; l.push({ pilot: r.pilot, location: r.location, qty: r.qty }); owned.set(r.typeId, l); } } catch { /* assets optional */ }
  }
  const rows = ids.map(id => {
    const t = sde.type(id) || {}; const n = need.get(id); const p = prices[id] || {};
    const pilots = [...n.pilots.values()].map(x => ({ id: x.id, name: x.name, plans: [...x.plans] }));
    const have = owned.get(id) || [];
    const books = have.reduce((s, x) => s + x.qty, 0);
    return { skillId: id, name: t.name || String(id), group: t.group || '', price: p.sell ?? p.avg ?? null, pilots, owned: have, toBuy: Math.max(0, pilots.length - books) };
  }).sort((a, b) => (b.toBuy * (b.price || 0)) - (a.toBuy * (a.price || 0)) || a.name.localeCompare(b.name));
  return { rows, total: rows.reduce((s, r) => s + r.toBuy * (r.price || 0), 0), errors };
}

module.exports = { list };
