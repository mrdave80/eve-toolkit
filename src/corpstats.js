'use strict';
/* Corporation fuel and member activity, for directors:
   - fuel: fuel blocks and magmatic gas in each structure's fuel bay and in corp hangars, the burn rate
     worked out from what's in the bay and when it runs out, and how many days the reserves cover
   - leaderboard: ratting tax and mining per member, from the corp wallet journal and moon mining ledger */
const sde = require('./sde');
const corp = require('./corp');
const { get, getAllPages, safe, ok, resolveNames, marketPrices } = require('./esi');

const DAY = 86400000;
const isFuel = n => /Fuel Block$/i.test(n || '');
const isGas = n => /^Magmatic Gas$/i.test(n || '');
const roleHint = (r, need) => r && r.__status === 403 ? `Needs the in-game ${need} role on this pilot.` : (r && r.__error) || null;

async function fuel(directorId) {
  const { corporationId } = await corp.corpOf(directorId);
  const [st, assets] = await Promise.all([
    safe(() => getAllPages(`/corporations/${corporationId}/structures/`, directorId, 10)),
    safe(() => getAllPages(`/corporations/${corporationId}/assets/`, directorId, 40))
  ]);
  if (!ok(st)) throw new Error(roleHint(st, 'Station Manager'));
  if (!ok(assets)) throw new Error(roleHint(assets, 'Director'));
  const typeIds = [...new Set(assets.map(a => a.type_id))];
  const names = await resolveNames([...typeIds, ...st.map(s => s.system_id)], directorId);
  const kind = t => (isFuel(names[t]) ? 'fuel' : isGas(names[t]) ? 'gas' : null);
  const byItem = new Map(assets.map(a => [a.item_id, a]));
  const rootOf = a => { let cur = a, g = 0; while (byItem.has(cur.location_id) && g++ < 10) cur = byItem.get(cur.location_id); return cur; };
  const structById = new Map(st.map(s => [s.structure_id, s]));
  const now = Date.now();
  // In each structure's fuel bay
  const bay = new Map();   // structureId -> { fuel, gas, types }
  // In hangars, by where they are
  const stock = new Map(); // locationId -> { fuel, gas, byType }
  for (const a of assets) {
    const k = kind(a.type_id); if (!k) continue;
    if (a.location_flag === 'StructureFuel' && structById.has(a.location_id)) {
      const b = bay.get(a.location_id) || { fuel: 0, gas: 0, types: {} };
      b[k] += a.quantity; b.types[names[a.type_id]] = (b.types[names[a.type_id]] || 0) + a.quantity; bay.set(a.location_id, b);
      continue;
    }
    const root = rootOf(a); const loc = root.location_id;
    const s = stock.get(loc) || { fuel: 0, gas: 0, byType: {} };
    s[k] += a.quantity; s.byType[names[a.type_id]] = (s.byType[names[a.type_id]] || 0) + a.quantity; stock.set(loc, s);
  }
  const locNames = await resolveNames([...stock.keys()].filter(id => (id >= 60000000 && id < 64000000) || id >= 1e12), directorId).catch(() => ({}));
  const sysOfLoc = id => { const s = structById.get(id); if (s) return s.system_id; return null; };
  const structures = st.map(s => {
    const b = bay.get(s.structure_id) || { fuel: 0, gas: 0, types: {} };
    const daysLeft = s.fuel_expires ? Math.max(0, (Date.parse(s.fuel_expires) - now) / DAY) : null;
    // burn from what's in the bay and when it runs out (gas for Metenox drills runs alongside blocks)
    const fuelPerDay = daysLeft && b.fuel ? b.fuel / daysLeft : 0;
    const gasPerDay = daysLeft && b.gas ? b.gas / daysLeft : 0;
    const local = stock.get(s.structure_id) || { fuel: 0, gas: 0 };
    return { id: s.structure_id, name: s.name || `Structure ${s.structure_id}`, typeId: s.type_id, system: names[s.system_id], systemId: s.system_id, state: s.state,
      fuelExpires: s.fuel_expires || null, daysLeft, bay: b, fuelPerDay, gasPerDay, services: (s.services || []).filter(v => v.state === 'online').map(v => v.name),
      inHangar: local, extraDays: fuelPerDay ? local.fuel / fuelPerDay : null };
  }).sort((a, b) => (a.daysLeft ?? -1) - (b.daysLeft ?? -1));
  const burn = { fuel: structures.reduce((n, s) => n + s.fuelPerDay, 0), gas: structures.reduce((n, s) => n + s.gasPerDay, 0) };
  const reserves = [...stock.entries()].map(([id, s]) => ({ id, name: (structById.get(id) || {}).name || locNames[id] || (id >= 30000000 && id < 33000000 ? 'In space' : `Location ${id}`), system: sysOfLoc(id) ? names[sysOfLoc(id)] : null, ...s }))
    .sort((a, b) => b.fuel - a.fuel);
  const total = { fuel: reserves.reduce((n, r) => n + r.fuel, 0), gas: reserves.reduce((n, r) => n + r.gas, 0) };
  const prices = await marketPrices();
  const fuelTypes = typeIds.filter(t => isFuel(names[t]));
  const avgFuel = fuelTypes.length ? fuelTypes.reduce((n, t) => n + (prices.get(t) || 0), 0) / fuelTypes.length : 0;
  return {
    structures, reserves, total, burn,
    daysOnHand: { fuel: burn.fuel ? total.fuel / burn.fuel : null, gas: burn.gas ? total.gas / burn.gas : null },
    monthly: { fuel: burn.fuel * 30, gas: burn.gas * 30, isk: burn.fuel * 30 * avgFuel },
    soonest: structures.find(s => s.daysLeft !== null) || null
  };
}

const BOUNTY = new Set(['bounty_prizes', 'ess_escrow_transfer']);
/**
 * Per member: ratting tax paid to the corp (bounties and ESS payouts) and moon ore mined at corp drills.
 * o: { days (default 30), division (wallet, default 1) }
 */
async function leaderboard(directorId, o = {}) {
  const { corporationId } = await corp.corpOf(directorId);
  const days = Math.max(1, Math.min(90, Number(o.days) || 30));
  const since = Date.now() - days * DAY;
  const [info, members, journal, observers] = await Promise.all([
    get(`/corporations/${corporationId}/`),
    safe(() => get(`/corporations/${corporationId}/members/`, directorId)),
    safe(() => getAllPages(`/corporations/${corporationId}/wallets/${o.division || 1}/journal/`, directorId, 30)),
    safe(() => getAllPages(`/corporation/${corporationId}/mining/observers/`, directorId, 5))
  ]);
  const memberSet = new Set(ok(members) ? members : []);
  const by = new Map();
  const row = id => by.get(id) || by.set(id, { id, tax: 0, ticks: 0, ess: 0, mined: 0, minedValue: 0, ores: {}, last: null }).get(id);
  let journalError = null, oldest = null;
  if (ok(journal)) {
    for (const e of journal) {
      const t = Date.parse(e.date); if (t < since || !BOUNTY.has(e.ref_type) || !(e.amount > 0)) continue;
      // The member is whichever party isn't the corp (or the one in the member list)
      const pid = [e.first_party_id, e.second_party_id].find(id => memberSet.has(id)) || [e.first_party_id, e.second_party_id].find(id => id && id !== corporationId && id > 90000000);
      if (!pid) continue;
      const r = row(pid);
      if (e.ref_type === 'ess_escrow_transfer') r.ess += e.amount; else { r.tax += e.amount; r.ticks++; }
      if (!r.last || e.date > r.last) r.last = e.date;
      if (!oldest || t < oldest) oldest = t;
    }
  } else journalError = roleHint(journal, 'Accountant or Junior Accountant');
  let miningError = null;
  if (ok(observers)) {
    const prices = await marketPrices();
    for (const ob of observers) {
      const r = await safe(() => getAllPages(`/corporation/${corporationId}/mining/observers/${ob.observer_id}/`, directorId, 20));
      if (!ok(r)) continue;
      for (const x of r) {
        if (Date.parse(x.last_updated) < since - DAY) continue;
        const m = row(x.character_id);
        m.mined += x.quantity; m.minedValue += (prices.get(x.type_id) || 0) * x.quantity;
        m.ores[x.type_id] = (m.ores[x.type_id] || 0) + x.quantity;
      }
    }
  } else miningError = roleHint(observers, 'Accountant');
  const rows = [...by.values()];
  const names = await resolveNames([...rows.map(r => r.id), ...rows.flatMap(r => Object.keys(r.ores).map(Number))], directorId).catch(() => ({}));
  const rate = info.tax_rate || 0;
  const out = rows.map(r => ({ ...r, name: names[r.id] || String(r.id), member: memberSet.has(r.id),
    // corp tax is a share of the bounty; work back to what they earned
    earned: rate ? (r.tax + r.ess) / rate : null, ores: Object.entries(r.ores).map(([t, q]) => ({ typeId: Number(t), name: names[t] || (sde.ready() && (sde.type(Number(t)) || {}).name) || t, qty: q })).sort((a, b) => b.qty - a.qty).slice(0, 5) }));
  return {
    days, taxRate: rate, journalError, miningError, oldest: oldest ? new Date(oldest).toISOString() : null,
    ratting: out.filter(r => r.tax + r.ess > 0).sort((a, b) => (b.tax + b.ess) - (a.tax + a.ess)),
    mining: out.filter(r => r.mined > 0).sort((a, b) => b.minedValue - a.minedValue),
    totals: { tax: out.reduce((n, r) => n + r.tax + r.ess, 0), mined: out.reduce((n, r) => n + r.minedValue, 0), ratters: out.filter(r => r.tax + r.ess > 0).length, miners: out.filter(r => r.mined > 0).length }
  };
}

module.exports = { fuel, leaderboard };
