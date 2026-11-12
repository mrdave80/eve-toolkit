// Item list parsing (inventory / contract / cargo scan / EFT / multibuy) and appraisal.
const sde = require('./sde');
const market = require('./market');

const num = s => { const n = Number(String(s).replace(/[\s,.'](?=\d{3}\b)/g, '').replace(/,/g, '').trim()); return isFinite(n) ? n : NaN; };

function parseItems(text) {
  const items = new Map(), unknown = [];
  const add = (name, qty) => {
    name = String(name).replace(/\*$/, '').replace(/\s*\/OFFLINE$/i, '').trim();
    if (!name || /^\[empty .+slot\]$/i.test(name)) return;
    let id = sde.typeIdByName(name);
    if (!id && / Blueprint$/i.test(name) === false) id = sde.typeIdByName(name.replace(/\s+\(.*\)$/, ''));
    if (!id) { unknown.push(name); return; }
    items.set(id, (items.get(id) || 0) + (qty > 0 ? qty : 1));
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const eftHead = /^\[([^,\]]+),.*\]$/.exec(line);
    if (eftHead) { add(eftHead[1], 1); continue; }
    if (line.includes('\t')) {
      const cols = line.split('\t').map(c => c.trim());
      // Inventory / contract: Name, Quantity, ...   Cargo scan: Quantity, Name
      if (sde.typeIdByName(cols[0])) { const q = num(cols[1]); add(cols[0], isNaN(q) ? 1 : q); continue; }
      if (cols[1] && sde.typeIdByName(cols[1]) && !isNaN(num(cols[0]))) { add(cols[1], num(cols[0])); continue; }
      // D-scan: [typeID] Name Type Distance -> count the type column
      const typeCol = cols.find((c, i) => i > 0 && sde.typeIdByName(c) && !/km|AU|m$/.test(c));
      if (typeCol) { add(typeCol, 1); continue; }
      unknown.push(cols[0]);
      continue;
    }
    let m;
    if ((m = /^(\d[\d,. ]*)\s*x\s+(.+)$/i.exec(line))) { add(m[2], num(m[1])); continue; }       // 10x Name / 10 x Name
    if ((m = /^(.+?)\s+x\s*(\d[\d,. ]*)$/i.exec(line))) { add(m[1], num(m[2])); continue; }       // Name x10
    if (line.includes(',') && !/^\d/.test(line)) {                                              // EFT "Module, Charge"
      const [a, b] = line.split(',').map(x => x.trim());
      if (sde.typeIdByName(a)) { add(a, 1); if (b) add(b, 1); continue; }
    }
    if ((m = /^(.+?)\s+(\d[\d,. ]*)$/.exec(line)) && sde.typeIdByName(m[1])) { add(m[1], num(m[2])); continue; }  // multibuy "Name 10"
    add(line, 1);
  }
  return { items: [...items.entries()].map(([typeId, qty]) => ({ typeId, qty, name: (sde.type(typeId) || {}).name })), unknown };
}

// Items with no orders anywhere in the hub's region (supercarriers, titans and other contract-only goods).
// CCP's average/adjusted price for these is usually far below contract prices, so we also work out the
// material cost from the blueprint and use whichever is higher, unless the user has set their own price.
async function estimateNoMarket(ids, hub, avgOf) {
  const out = {};
  const mats = {};
  for (const id of ids) {
    try {
      const bi = sde.blueprintFor(id);
      const act = bi && sde.blueprint(bi.blueprintId)?.a?.[bi.activity];
      if (!act || !act.m) continue;
      const per = (act.p.find(p => p[0] === id) || [0, 1])[1] || 1;
      mats[id] = { per, m: act.m };
    } catch { /* no blueprint */ }
  }
  const matIds = [...new Set(Object.values(mats).flatMap(x => x.m.map(([m]) => m)))];
  const mp = matIds.length ? await market.prices(matIds, hub) : {};
  for (const id of ids) {
    const avg = avgOf(id);
    let build = 0, missing = 0;
    if (mats[id]) {
      for (const [m, q] of mats[id].m) { const p = mp[m] || {}; const u = p.sell ?? p.avg ?? 0; if (!u) missing++; build += u * q; }
      build /= mats[id].per;
    }
    if (build > avg) out[id] = { price: build, source: 'build', avg, build, missing };
    else out[id] = { price: avg, source: 'avg', avg, build, missing };
  }
  return out;
}

async function appraise(text, hub = 'Jita', overrides = {}) {
  return appraiseItems(parseItems(text), hub, overrides);
}
async function appraiseItems({ items, unknown = [] }, hub = 'Jita', overrides = {}) {
  items = items.map(i => ({ ...i, name: i.name || (sde.type(i.typeId) || {}).name || 'Type ' + i.typeId }));
  const prices = await market.prices(items.map(i => i.typeId), hub);
  const noMarket = items.filter(i => { const p = prices[i.typeId] || {}; return p.sell == null && p.buy == null && !p.error; }).map(i => i.typeId);
  const est = noMarket.length ? await estimateNoMarket(noMarket, hub, id => (prices[id] || {}).avg || 0) : {};
  let sell = 0, buy = 0, volume = 0;
  const rows = items.map(i => {
    const t = sde.type(i.typeId) || {};
    const p = prices[i.typeId] || {};
    const ov = Number(overrides[i.typeId]) > 0 ? Number(overrides[i.typeId]) : null;
    const e = est[i.typeId];
    let s, b, priceSource = 'market';
    if (ov) { s = b = ov; priceSource = 'yours'; }
    else if (e) { s = b = e.price; priceSource = e.source; }
    else { s = p.sell ?? p.avg ?? 0; b = p.buy ?? 0; if (p.sell == null) priceSource = 'avg'; }
    // Ships' volume in the SDE is assembled; packaged volume is what matters for hauling, but keep SDE value.
    sell += s * i.qty; buy += b * i.qty; volume += (t.volume || 0) * i.qty;
    return { ...i, group: t.group, category: t.category, categoryId: t.categoryId, unitSell: s, unitBuy: b, sell: s * i.qty, buy: b * i.qty,
      volume: (t.volume || 0) * i.qty, noOrders: !!e || (p.sell == null && p.buy == null), priceSource, estimate: e || null, override: ov };
  }).sort((a, b) => b.sell - a.sell);
  return { hub, rows, unknown, totals: { sell, buy, split: (sell + buy) / 2, volume, items: rows.reduce((n, r) => n + r.qty, 0) } };
}

/** zKillboard link, kill id or ESI killmail link: what dropped, what was destroyed, and what it was all worth. */
const KILL_RE = /killmails\/(\d+)\/([0-9a-f]{40})/i;
const isKillLink = t => KILL_RE.test(t) || /zkillboard\.com\/kill\/(\d+)/i.test(t);
async function killmail(input, hub = 'Jita', overrides = {}) {
  const { get } = require('./esi');
  const t = String(input || '').trim();
  let id, hash, m;
  if ((m = KILL_RE.exec(t))) { id = Number(m[1]); hash = m[2]; }
  else if ((m = /zkillboard\.com\/kill\/(\d+)/i.exec(t)) || (m = /^(\d{6,})$/.exec(t))) id = Number(m[1]);
  if (!id) throw new Error('Paste a zKillboard link or an in-game "Copy External Kill Link".');
  let zkb = null;
  if (!hash) {
    const z = await require('./zkill').zk(`/killID/${id}/`, 3600000);
    hash = Array.isArray(z) && z[0] && z[0].zkb && z[0].zkb.hash; zkb = z && z[0] && z[0].zkb;
    if (!hash) throw new Error('zKillboard doesn’t have that killmail.');
  }
  const km = await get(`/killmails/${id}/${hash}/`);
  const v = km.victim || {};
  const dropped = new Map(), destroyed = new Map();
  const walk = list => { for (const it of list || []) { if (it.quantity_dropped) dropped.set(it.item_type_id, (dropped.get(it.item_type_id) || 0) + it.quantity_dropped); if (it.quantity_destroyed) destroyed.set(it.item_type_id, (destroyed.get(it.item_type_id) || 0) + it.quantity_destroyed); walk(it.items); } };
  walk(v.items);
  const asItems = mp => ({ items: [...mp.entries()].map(([typeId, qty]) => ({ typeId, qty })), unknown: [] });
  const [dr, de, hull] = await Promise.all([appraiseItems(asItems(dropped), hub, overrides), appraiseItems(asItems(destroyed), hub, overrides), appraiseItems({ items: [{ typeId: v.ship_type_id, qty: 1 }] }, hub, overrides)]);
  const names = await require('./esi').resolveNames([v.character_id, v.corporation_id, v.alliance_id].filter(Boolean)).catch(() => ({}));
  const sys = sde.ready() ? sde.system(km.solar_system_id) : null;
  return { id, time: km.killmail_time, ship: hull.rows[0] || null, shipTypeId: v.ship_type_id, victim: names[v.character_id] || null, corp: names[v.corporation_id] || null, alliance: names[v.alliance_id] || null,
    system: sys ? sys.name : null, security: sys ? sys.security : null, attackers: (km.attackers || []).length,
    dropped: dr, destroyed: de, totals: { dropped: dr.totals.sell, destroyed: de.totals.sell + hull.totals.sell, total: dr.totals.sell + de.totals.sell + hull.totals.sell, hull: hull.totals.sell }, zkbValue: zkb ? zkb.totalValue : null };
}

module.exports = { parseItems, appraise, appraiseItems, killmail, isKillLink };
