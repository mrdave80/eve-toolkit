'use strict';
/* Price alerts: a watchlist of items with "below" and "above" prices at a trade hub.
   Each alert fires once when the price crosses, and re-arms when it moves back past the line by 1%. */
const crypto = require('crypto');
const store = require('./store');
const sde = require('./sde');
const market = require('./market');

const MAX_ITEMS = 100, MAX_SAMPLES = 96, REARM = 0.01;
const list = () => { const d = store.get(); d.priceWatch = Array.isArray(d.priceWatch) ? d.priceWatch : []; return d.priceWatch; };
const save = () => store.save();
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const nameOf = id => (sde.ready() && (sde.type(id) || {}).name) || `Type ${id}`;

function clean(p, base = {}) {
  const hub = market.HUBS[p.hub] ? p.hub : (base.hub || 'Jita');
  const side = p.side === 'buy' ? 'buy' : p.side === 'sell' ? 'sell' : (base.side || 'sell');
  const below = 'below' in p ? num(p.below) : base.below ?? null;
  const above = 'above' in p ? num(p.above) : base.above ?? null;
  if (!below && !above) throw new Error('Set a price to alert below, above, or both.');
  if (below && above && below >= above) throw new Error('The "below" price must be lower than the "above" price.');
  return { hub, side, below, above, note: 'note' in p ? String(p.note || '').slice(0, 120) : base.note || '' };
}

function add(p) {
  const l = list();
  if (l.length >= MAX_ITEMS) throw new Error(`The watchlist holds up to ${MAX_ITEMS} items.`);
  let typeId = Number(p.typeId) || null;
  if (!typeId && p.name) typeId = sde.ready() ? sde.typeIdByName(String(p.name).trim()) : null;
  if (!typeId) throw new Error('Pick an item from the list.');
  const t = sde.ready() ? sde.type(typeId) : null;
  if (t && !t.marketGroupId) throw new Error(`${t.name} isn't sold on the market.`);
  const row = { id: crypto.randomBytes(6).toString('hex'), typeId, name: nameOf(typeId), ...clean(p), added: Date.now(), fired: { below: false, above: false }, last: null, samples: [], lastAlert: null };
  l.push(row); save();
  return row;
}

function update(id, patch) {
  const r = list().find(x => x.id === id); if (!r) throw new Error('Not on the watchlist.');
  const c = clean(patch || {}, r);
  // A changed line re-arms its alert
  if (c.below !== r.below) r.fired.below = false;
  if (c.above !== r.above) r.fired.above = false;
  Object.assign(r, c); save();
  return r;
}

function remove(id) { const l = list(); const i = l.findIndex(x => x.id === id); if (i >= 0) { l.splice(i, 1); save(); } return true; }

/** Fetch prices for every item, record a sample, and return the alerts that just fired. */
async function check() {
  const l = list(); if (!l.length) return { rows: l, alerts: [] };
  const byHub = {};
  for (const r of l) (byHub[r.hub] = byHub[r.hub] || new Set()).add(r.typeId);
  const prices = {};
  for (const [hub, ids] of Object.entries(byHub)) prices[hub] = await market.prices([...ids], hub);
  const now = Date.now(), alerts = [];
  for (const r of l) {
    const p = (prices[r.hub] || {})[r.typeId] || {};
    const v = r.side === 'buy' ? p.buy : p.sell;
    if (v === null || v === undefined) { r.error = r.side === 'buy' ? 'No buy orders' : 'No sell orders'; continue; }
    r.error = null;
    r.prev = r.last; r.last = v; r.lastAt = now;
    r.samples.push([now, v]); if (r.samples.length > MAX_SAMPLES) r.samples.splice(0, r.samples.length - MAX_SAMPLES);
    if (r.below) {
      if (!r.fired.below && v <= r.below) { r.fired.below = true; r.lastAlert = now; alerts.push({ row: r, dir: 'below', price: v }); }
      else if (r.fired.below && v > r.below * (1 + REARM)) r.fired.below = false;
    }
    if (r.above) {
      if (!r.fired.above && v >= r.above) { r.fired.above = true; r.lastAlert = now; alerts.push({ row: r, dir: 'above', price: v }); }
      else if (r.fired.above && v < r.above * (1 - REARM)) r.fired.above = false;
    }
  }
  save();
  return { rows: l, alerts };
}

const status = () => list();

module.exports = { add, update, remove, check, status, _list: list };
