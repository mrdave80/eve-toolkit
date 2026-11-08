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
  const { items, unknown } = parseItems(text);
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

module.exports = { parseItems, appraise };
