'use strict';
/* PI colony watchdog: from a colony's last saved state, work out when storage fills up and when
   factories run out of inputs, not just when extractors stop. ESI only refreshes a colony when you
   open it in game, so every projection starts from that moment (last_update). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let PI = null;
function piData() {
  if (PI) return PI;
  const code = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pi-data.js'), 'utf8');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(code + '\n;this.PI = PI;', ctx);
  PI = ctx.PI;
  return PI;
}

const VOL = [0.01, 0.38, 0.75, 3, 50];          // m³ per unit for P0..P4
const CAP = [[/Launchpad/i, 10000], [/Storage Facility/i, 12000], [/Command Center/i, 500]];
const capOf = name => { for (const [re, v] of CAP) if (re.test(name)) return v; return 0; };

/**
 * pins: raw ESI pins; names: typeId -> name; lastUpdate: ISO; now: ms.
 * Returns { storage: {used, cap, pct, fullAt}, dry: [{item, at}], idle: [factory names], stale, horizonH }
 */
function simulate(pins, names, lastUpdate, now = Date.now(), horizonH = 72) {
  const pi = piData();
  const t0 = Date.parse(lastUpdate) || now;
  const tier = n => (pi.items[n] ? pi.items[n].tier : 0);
  const vol = n => VOL[tier(n)] ?? 0.01;
  const stock = new Map(), prod = [], cons = new Map(), made = new Map();
  let cap = 0;
  const idle = [];
  for (const pin of pins || []) {
    const tn = names[pin.type_id] || '';
    cap += capOf(tn);
    for (const c of pin.contents || []) { const n = names[c.type_id]; if (n) stock.set(n, (stock.get(n) || 0) + c.amount); }
    if (pin.extractor_details && pin.extractor_details.product_type_id) {
      const ed = pin.extractor_details, n = names[ed.product_type_id];
      const until = pin.expiry_time ? Date.parse(pin.expiry_time) : t0;
      if (n && ed.cycle_time) prod.push({ name: n, perH: (ed.qty_per_cycle || 0) / (ed.cycle_time / 3600), until });
    }
    const sid = (pin.factory_details && pin.factory_details.schematic_id) || pin.schematic_id;
    if (sid) {
      const out = names['schematic:' + sid];
      const it = out && pi.items[out];
      if (!it || !it.inputs.length) continue;
      for (const i of it.inputs) cons.set(i.name, (cons.get(i.name) || 0) + i.qty / it.cycleH);
      made.set(out, (made.get(out) || 0) + it.out / it.cycleH);
      // A factory that hasn't started a cycle in two cycle lengths had nothing to work with
      const last = pin.last_cycle_start ? Date.parse(pin.last_cycle_start) : 0;
      if (!last || t0 - last > 2 * it.cycleH * 3600000) idle.push(out);
    }
  }
  const used0 = [...stock.entries()].reduce((n, [k, v]) => n + v * vol(k), 0);
  // Step through time: extractors stop at their expiry; consumers stop once an input runs out
  const dt = 0.25, dry = new Map();
  let fullAt = null, s = new Map(stock);
  for (let h = 0; h < horizonH; h += dt) {
    const t = t0 + h * 3600000;
    for (const p of prod) if (t < p.until) s.set(p.name, (s.get(p.name) || 0) + p.perH * dt);
    // factories only run while every input is there
    for (const [out, rate] of made) {
      const it = pi.items[out], n = rate / (it.out / it.cycleH);   // number of factories making it
      let share = 1;
      for (const i of it.inputs) {
        const need = i.qty / it.cycleH * dt * n, have = s.get(i.name) || 0;
        if (have < need - 1e-6) { share = Math.min(share, have / need); if (!dry.has(i.name)) dry.set(i.name, t); }
      }
      for (const i of it.inputs) s.set(i.name, Math.max(0, (s.get(i.name) || 0) - i.qty / it.cycleH * dt * n * share));
      s.set(out, (s.get(out) || 0) + rate * dt * share);
    }
    const used = [...s.entries()].reduce((n, [k, v]) => n + Math.max(0, v) * vol(k), 0);
    if (cap && used >= cap && fullAt === null) fullAt = t;
  }
  return {
    lastUpdate: new Date(t0).toISOString(), staleHours: Math.round((now - t0) / 3600000),
    storage: { used: Math.round(used0), cap, pct: cap ? Math.min(100, Math.round(used0 / cap * 100)) : 0, fullAt: fullAt ? new Date(fullAt).toISOString() : null },
    dry: [...dry.entries()].map(([item, at]) => ({ item, at: new Date(at).toISOString() })).sort((a, b) => a.at.localeCompare(b.at)),
    idle: [...new Set(idle)], horizonH
  };
}

module.exports = { simulate, piData };
