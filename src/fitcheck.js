'use strict';
/* Fit checker: slots, fitting resources with each pilot's skills, who can fly it, cost and hull stats.
   Damage, tank and capacitor come from EVEShip.fit's dogma engine (see fitengine.js). */
const sde = require('./sde');
const market = require('./market');
const store = require('./store');
const skillplan = require('./skillplan');
const doctrines = require('./doctrines');
const fitengine = require('./fitengine');

const A = {
  cpu: 50, power: 30, cpuOut: 48, powerOut: 11, calCost: 1153, calOut: 1132, hi: 14, med: 13, low: 12, rig: 1137, sub: 1367,
  turrets: 102, launchers: 101, cpuMult: 202, powerMult: 145,
  shieldHp: 263, armorHp: 265, hullHp: 9, velocity: 37, mass: 4, inertia: 70, cargo: 38, droneBay: 283, bandwidth: 1271, sig: 552,
  lockRange: 76, scanRes: 564, maxLocked: 192, cap: 482, capRecharge: 55, warpSpeed: 600,
  res: { shield: [271, 274, 273, 272], armor: [267, 270, 269, 268], hull: [113, 110, 109, 111] }   // EM, thermal, kinetic, explosive
};
const SK = { cpuMgmt: 3426, pgMgmt: 3413, weaponUpg: 3318, advWeaponUpg: 11207, energyGridUpg: 3424, electronicsUpg: 3432, shieldUpg: 3425 };
const TURRET_GROUPS = /^(Energy Weapon|Projectile Weapon|Hybrid Weapon|Precursor Weapon|Vorton Projector)$/i;
const LAUNCHER_GROUPS = /Missile Launcher/i;
const WEAPON_GROUPS = /^(Energy Weapon|Projectile Weapon|Hybrid Weapon|Precursor Weapon|Vorton Projector|Smart Bomb)$|Missile Launcher/i;

function attrMap(id) {
  const full = sde.fullAttrs(id);
  const m = new Map();
  if (full) for (const a of full) m.set(a.id, a.value);
  for (const [k, v] of Object.entries(sde.attrs(id))) if (!m.has(Number(k))) m.set(Number(k), v);
  return m;
}

/** EFT into slot sections. Order in EFT and the in-game copy: low, mid, high, rigs, subsystems, then drones and cargo. */
function parse(text) {
  const fit = doctrines.parseEft(text);   // validates the header and item names
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex(l => /^\s*\[.+,.+\]\s*$/.test(l));
  const sections = []; let cur = [];
  for (const raw of lines.slice(start + 1)) {
    const l = raw.trim();
    if (!l) { if (cur.length) { sections.push(cur); cur = []; } continue; }
    cur.push(l);
  }
  if (cur.length) sections.push(cur);
  const slots = { low: [], med: [], high: [], rig: [], sub: [] }, drones = [], cargo = [], unknown = [];
  const ORDER = ['low', 'med', 'high', 'rig', 'sub'];
  let moduleSection = 0;
  for (const sec of sections) {
    const empty = sec.map(l => (/^\[empty (low|med|high|rig|subsystem) slot\]$/i.exec(l) || [])[1]).find(Boolean);
    const rows = sec.map(l => {
      if (/^\[empty .+ slot\]$/i.test(l)) return { empty: true };
      const q = /^(.+?)\s+x(\d+)$/i.exec(l);
      const [mod, charge] = (q ? q[1] : l).split(',').map(x => x.trim());
      const offline = /\/OFFLINE$/i.test(mod);
      const name = mod.replace(/\s*\/OFFLINE$/i, '');
      const id = sde.typeIdByName(name);
      if (!id) { unknown.push(name); return null; }
      const t = sde.type(id);
      const chargeId = charge ? sde.typeIdByName(charge) : null;
      if (charge && !chargeId) unknown.push(charge);
      return { id, name: t.name, qty: q ? Number(q[2]) : 1, stacked: !!q, offline, chargeId, charge: chargeId ? sde.type(chargeId).name : null, categoryId: t.categoryId, group: t.group };
    }).filter(Boolean);
    const real = rows.filter(r => !r.empty);
    if (!real.length && !empty) continue;
    let kind;
    if (empty) kind = { low: 'low', med: 'med', high: 'high', rig: 'rig', subsystem: 'sub' }[empty.toLowerCase()];
    else if (real.every(r => r.stacked) || real.every(r => [18, 87].includes(r.categoryId))) kind = real.every(r => [18, 87].includes(r.categoryId)) ? 'drones' : 'cargo';
    else if (real.every(r => r.categoryId === 32)) kind = 'sub';
    else if (real.every(r => /\bRig\b/i.test(r.group))) kind = 'rig';
    else if (real.every(r => r.categoryId === 7)) kind = ORDER[Math.min(2, moduleSection)];
    else kind = 'cargo';
    if (['low', 'med', 'high'].includes(kind)) moduleSection = ORDER.indexOf(kind) + 1;
    if (kind === 'drones') drones.push(...real);
    else if (kind === 'cargo') cargo.push(...real);
    else slots[kind].push(...rows.map(r => (r.empty ? { empty: true } : r)));
  }
  return { ...fit, slots, drones, cargo, unknown: [...new Set([...fit.unknown, ...unknown])] };
}

/** Fitting resources for one set of skill levels (Map skillId -> level). */
function fitting(fit, levels) {
  const L = id => (levels ? levels.get(id) || 0 : 5);
  const ship = attrMap(fit.shipTypeId);
  const mods = [...fit.slots.low, ...fit.slots.med, ...fit.slots.high].filter(m => !m.empty && !m.offline);
  const rigs = fit.slots.rig.filter(m => !m.empty);
  let cpuOut = (ship.get(A.cpuOut) || 0) * (1 + 0.05 * L(SK.cpuMgmt));
  let pgOut = (ship.get(A.powerOut) || 0) * (1 + 0.05 * L(SK.pgMgmt));
  for (const m of [...mods, ...rigs]) {
    const a = attrMap(m.id);
    if (a.get(A.cpuMult) && a.get(A.cpuMult) !== 1) cpuOut *= a.get(A.cpuMult);
    if (a.get(A.powerMult) && a.get(A.powerMult) !== 1) pgOut *= a.get(A.powerMult);
  }
  let cpu = 0, pg = 0;
  const rows = mods.map(m => {
    const a = attrMap(m.id);
    const req = new Set(sde.requirements(m.id).map(r => r.id));
    let c = a.get(A.cpu) || 0, p = a.get(A.power) || 0;
    if (WEAPON_GROUPS.test(m.group)) { c *= 1 - 0.05 * L(SK.weaponUpg); p *= 1 - 0.02 * L(SK.advWeaponUpg); }
    if (req.has(SK.energyGridUpg)) c *= 1 - 0.05 * L(SK.energyGridUpg);
    if (req.has(SK.electronicsUpg)) c *= 1 - 0.05 * L(SK.electronicsUpg);
    if (req.has(SK.shieldUpg)) p *= 1 - 0.05 * L(SK.shieldUpg);
    cpu += c; pg += p;
    return { id: m.id, cpu: c, pg: p };
  });
  const cal = rigs.reduce((n, r) => n + (attrMap(r.id).get(A.calCost) || 0), 0);
  const calOut = ship.get(A.calOut) || 0;
  return { cpu, cpuOut, pg, pgOut, cal, calOut, ok: cpu <= cpuOut + 0.01 && pg <= pgOut + 0.01 && cal <= calOut + 0.01, rows };
}

function slotCheck(fit) {
  const ship = attrMap(fit.shipTypeId);
  const used = k => fit.slots[k].filter(m => !m.empty).length;
  const all = [...fit.slots.high].filter(m => !m.empty);
  const turrets = all.filter(m => TURRET_GROUPS.test(m.group)).length, launchers = all.filter(m => LAUNCHER_GROUPS.test(m.group)).length;
  const out = {
    high: { used: used('high'), max: ship.get(A.hi) || 0 }, med: { used: used('med'), max: ship.get(A.med) || 0 }, low: { used: used('low'), max: ship.get(A.low) || 0 },
    rig: { used: used('rig'), max: ship.get(A.rig) || 0 }, turrets: { used: turrets, max: ship.get(A.turrets) || 0 }, launchers: { used: launchers, max: ship.get(A.launchers) || 0 }
  };
  // Tech 3 cruisers get their slots from subsystems
  if (fit.slots.sub.some(m => !m.empty)) for (const s of fit.slots.sub.filter(m => !m.empty)) {
    const a = attrMap(s.id);
    out.high.max += a.get(1374) || 0; out.med.max += a.get(1375) || 0; out.low.max += a.get(1376) || 0;
    out.turrets.max += a.get(1368) || 0; out.launchers.max += a.get(1369) || 0;
  }
  const problems = Object.entries(out).filter(([, v]) => v.used > v.max).map(([k, v]) => ({ slot: k, over: v.used - v.max }));
  return { ...out, problems };
}

function hullStats(fit) {
  const a = attrMap(fit.shipTypeId);
  const res = layer => A.res[layer].map(id => (a.has(id) ? 1 - a.get(id) : null));
  const ehpLayer = (hp, r) => { const v = r.filter(x => x !== null); if (!v.length) return hp; const avg = v.reduce((s, x) => s + (1 - x), 0) / v.length; return hp / Math.max(0.01, avg); };
  const shield = a.get(A.shieldHp) || 0, armor = a.get(A.armorHp) || 0, hull = a.get(A.hullHp) || 0;
  const t = sde.type(fit.shipTypeId) || {};
  const mass = a.get(A.mass) || t.mass || 0, inertia = a.get(A.inertia) || 0;
  return {
    hp: { shield, armor, hull }, resists: { shield: res('shield'), armor: res('armor'), hull: res('hull') },
    ehp: Math.round(ehpLayer(shield, res('shield')) + ehpLayer(armor, res('armor')) + ehpLayer(hull, res('hull'))),
    velocity: a.get(A.velocity) || 0, align: mass && inertia ? Math.log(2) * mass * inertia / 1e6 : null, warpSpeed: a.get(A.warpSpeed) || null,
    cargo: a.get(A.cargo) || t.capacity || 0, droneBay: a.get(A.droneBay) || 0, bandwidth: a.get(A.bandwidth) || 0,
    sig: a.get(A.sig) || 0, lockRange: a.get(A.lockRange) || 0, scanRes: a.get(A.scanRes) || 0, maxLocked: a.get(A.maxLocked) || 0, cap: a.get(A.cap) || 0, capRecharge: (a.get(A.capRecharge) || 0) / 1000
  };
}

async function check(text, o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const fit = parse(text);
  const d = store.get();
  const charIds = (d.characters || []).filter(c => !c.needsReauth).map(c => c.id);
  const ids = new Set([fit.shipTypeId]);
  for (const k of Object.keys(fit.slots)) for (const m of fit.slots[k]) if (!m.empty) { ids.add(m.id); if (m.chargeId) ids.add(m.chargeId); }
  for (const m of [...fit.drones, ...fit.cargo]) ids.add(m.id);
  const [prices, reqCheck] = await Promise.all([market.prices([...ids], o.hub || 'Jita'), skillplan.checkReqs(doctrines.requirementsFor(fit), charIds, o.audits || {})]);
  const price = id => { const p = prices[id] || {}; return p.sell ?? p.avg ?? 0; };
  const counted = [];
  counted.push({ id: fit.shipTypeId, name: fit.ship, qty: 1, kind: 'Hull' });
  for (const [k, list] of Object.entries(fit.slots)) for (const m of list) if (!m.empty) { counted.push({ id: m.id, name: m.name, qty: 1, kind: k }); if (m.chargeId) counted.push({ id: m.chargeId, name: m.charge, qty: 1, kind: 'charge' }); }
  for (const m of fit.drones) counted.push({ id: m.id, name: m.name, qty: m.qty, kind: 'drone' });
  for (const m of fit.cargo) counted.push({ id: m.id, name: m.name, qty: m.qty, kind: 'cargo' });
  const hull = price(fit.shipTypeId);
  const total = counted.reduce((n, x) => n + price(x.id) * x.qty, 0);
  // fitting per pilot, plus all skills at V
  const pilots = [];
  const engine = { allV: null, pilots: {}, error: null };
  try { engine.allV = await fitengine.stats(fit, null); }
  catch (e) { engine.error = e.message || String(e); }
  for (const p of reqCheck.pilots) {
    let levels = null;
    if (!p.fromAudit) { try { levels = (await skillplan.charState(p.id)).levels; } catch { levels = null; } }
    pilots.push({ ...p, fitting: levels ? fitting(fit, levels) : null });
    if (levels && engine.allV) { try { engine.pilots[p.id] = await fitengine.stats(fit, Object.fromEntries(levels)); } catch {} }
  }
  const allV = fitting(fit, null);
  return {
    ship: fit.ship, shipTypeId: fit.shipTypeId, name: fit.name, eft: fit.eft, unknown: fit.unknown,
    slots: Object.fromEntries(Object.entries(fit.slots).map(([k, list]) => [k, list.map(m => (m.empty ? { empty: true } : { id: m.id, name: m.name, offline: m.offline, chargeId: m.chargeId, charge: m.charge, price: price(m.id) }))])),
    drones: fit.drones.map(m => ({ id: m.id, name: m.name, qty: m.qty })), cargo: fit.cargo.map(m => ({ id: m.id, name: m.name, qty: m.qty })),
    slotCheck: slotCheck(fit), allV, pilots, requirements: reqCheck.requirements.length, hull: hullStats(fit), hasFull: sde.hasFull(),
    cost: { hull, total, fittings: total - hull }, engine
  };
}

/** Pyfa reads EFT text from the clipboard, so "Open in Pyfa" is the fit in EFT with empty slots kept. */
function toEft(text) { return parse(text).eft; }

module.exports = { check, parse, fitting, toEft };
