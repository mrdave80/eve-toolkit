'use strict';
/* Wall of Shame: embarrassing losses from zKillboard, judged from the fit on each killmail. All in good fun. */
const sde = require('./sde');
const store = require('./store');
const { get, safe, ok, resolveNames } = require('./esi');
const { zk } = require('./zkill');

// Killmail item flags
const LOW = [11, 18], MED = [19, 26], HIGH = [27, 34], RIG = [92, 99], CARGO = 5, SUB = [125, 132];
const inRange = (f, [a, b]) => f >= a && f <= b;
const T = id => (sde.ready() && sde.type(id)) || null;

const GROUPS = {
  freighter: 513, jumpFreighter: 902, carrier: 547, dread: 485, fax: 1538, super: 659, titan: 30, rorqual: 883, marauder: 900, blops: 898, orca: 941,
  dst: 380, blockade: 1202, exhumer: 543, battleship: 27, capsule: 29, t3c: 963, hac: 358, faction: 1, industrial: 28, miningBarge: 463
};
// Wide net of groups where losses tend to be expensive or funny
const SCAN = [513, 902, 547, 485, 1538, 659, 30, 883, 900, 898, 941, 380, 1202, 543, 27, 29, 963, 28];
const HAULER = new Set(['Freighter', 'Jump Freighter', 'Hauler', 'Deep Space Transport', 'Blockade Runner', 'Industrial Command Ship']);
const NONCOMBAT = new Set([...HAULER, 'Capsule', 'Shuttle', 'Corvette', 'Mining Barge', 'Exhumer', 'Expedition Frigate', 'Mining Frigate', 'Capital Industrial Ship', 'Prototype Exploration Ship', 'Covert Ops', 'Citizen Ships']);
const BIG = new Set(['Battleship', 'Marauder', 'Black Ops', 'Carrier', 'Dreadnought', 'Force Auxiliary', 'Supercarrier', 'Titan', 'Capital Industrial Ship', 'Freighter', 'Jump Freighter', 'Attack Battlecruiser', 'Combat Battlecruiser', 'Command Ship']);
const SMALL = new Set(['Frigate', 'Assault Frigate', 'Interceptor', 'Destroyer', 'Interdictor', 'Tactical Destroyer', 'Command Destroyer', 'Stealth Bomber', 'Electronic Attack Ship', 'Covert Ops', 'Corvette', 'Expedition Frigate', 'Logistics Frigate']);
const SHIELD_TANK = new Set(['Shield Extender', 'Shield Hardener', 'Shield Booster', 'Ancillary Shield Booster', 'Shield Resistance Amplifier', 'Shield Power Relay', 'Rig Shield']);
const ARMOR_TANK = new Set(['Armor Plate', 'Armor Hardener', 'Armor Repair Unit', 'Ancillary Armor Repairer', 'Armor Coating', 'Energized Armor Membrane', 'Armor Resistance Shift Hardener', 'Rig Armor']);
const ANY_TANK = new Set([...SHIELD_TANK, ...ARMOR_TANK, 'Damage Control', 'Hull Repair Unit', 'Reinforced Bulkhead']);
const BLING_META = new Set([4, 5, 6]); // faction, officer, deadspace (metaGroupID)
const isWeapon = g => /Weapon|Launcher|Projectile|Hybrid|Energy/.test(g) && !/Upgrade|Computer|Enhancer|Rig|Stabilizer|Heat Sink|Gyrostabilizer|Ballistic/.test(g);

const CATS = {
  naked: { label: 'Flew it naked', why: 'No modules fitted at all', pts: 40 },
  halfFit: { label: 'Half-fitted', why: 'More than half the slots empty', pts: 22 },
  noTank: { label: 'No tank', why: 'A combat ship with no tank modules', pts: 18 },
  mixedTank: { label: 'Shield and armor? Pick one', why: 'Shield and armor tank on the same ship', pts: 15 },
  rainbow: { label: 'Rainbow weapons', why: 'More than one weapon system fitted', pts: 12 },
  bling: { label: 'All the bling, none of the skill', why: 'Faction, deadspace or officer modules, killed solo', pts: 25 },
  autopilot: { label: 'Autopilot special', why: 'Hauler with a fortune in the cargo hold, ganked', pts: 30 },
  rats: { label: 'Lost to the rats', why: 'An expensive ship killed by NPCs', pts: 28 },
  selfDestruct: { label: 'Self-destructed', why: 'The pilot blew up their own ship', pts: 20 },
  awox: { label: 'Awoxed', why: 'Killed by their own corp mates', pts: 18 },
  brain: { label: 'Expensive brain', why: 'Podded with a fortune in implants', pts: 22 },
  goliath: { label: 'David and Goliath', why: 'A big ship solo’d by a frigate or destroyer', pts: 30 },
  oof: { label: 'Big oof', why: 'Lost more than 10 billion ISK in one go', pts: 20 }
};

function analyse(km, zkb) {
  const v = km.victim || {};
  const ship = T(v.ship_type_id);
  if (!ship) return null;
  const g = ship.group;
  const items = v.items || [];
  const a = sde.attrs(v.ship_type_id);
  const slots = (a[12] || 0) + (a[13] || 0) + (a[14] || 0);
  const fitted = items.filter(i => inRange(i.flag, LOW) || inRange(i.flag, MED) || inRange(i.flag, HIGH));
  const fitTypes = fitted.map(i => T(i.item_type_id)).filter(Boolean);
  const groups = new Set(fitTypes.map(t => t.group));
  const rigGroups = new Set(items.filter(i => inRange(i.flag, RIG)).map(i => T(i.item_type_id)).filter(Boolean).map(t => /Shield/.test(t.name) ? 'Rig Shield' : /Armor|Trimark|Nanobot/.test(t.name) ? 'Rig Armor' : t.group));
  const allTank = new Set([...groups, ...rigGroups]);
  const players = (km.attackers || []).filter(x => x.character_id);
  const value = zkb.totalValue || 0, fittedValue = zkb.fittedValue || 0;
  const tags = [];
  const t3 = g === 'Strategic Cruiser';
  const combat = ship.categoryId === 6 && !NONCOMBAT.has(g);
  if (ship.categoryId === 6 && slots > 0 && !t3 && g !== 'Capsule') {
    if (!fitted.length) tags.push('naked');
    else if (fitted.length / slots < 0.45) tags.push('halfFit');
  }
  if (combat && fitted.length && ![...allTank].some(x => ANY_TANK.has(x))) tags.push('noTank');
  if ([...allTank].some(x => SHIELD_TANK.has(x)) && [...allTank].some(x => ARMOR_TANK.has(x)) && !NONCOMBAT.has(g)) tags.push('mixedTank');
  const weaponGroups = new Set(fitTypes.filter(t => isWeapon(t.group)).map(t => t.group));
  if (weaponGroups.size >= 2) tags.push('rainbow');
  const bling = fitTypes.filter(t => BLING_META.has(t.metaGroupId)).length;
  if (bling >= 3 && players.length === 1) tags.push('bling');
  const cargoValue = Math.max(0, value - fittedValue);
  const s = sde.system(km.solar_system_id);
  const hs = s && Math.round(s.security * 10) / 10 >= 0.5;
  if (HAULER.has(g) && cargoValue >= 1e9 && players.length >= 2) tags.push('autopilot');
  if (zkb.npc && value >= 3e8) tags.push('rats');
  if ((km.attackers || []).some(x => x.character_id && x.character_id === v.character_id && x.final_blow)) tags.push('selfDestruct');
  if (zkb.awox) tags.push('awox');
  if (g === 'Capsule' && value >= 1e9) tags.push('brain');
  if (BIG.has(g) && players.length === 1) { const att = T(players[0].ship_type_id); if (att && SMALL.has(att.group)) tags.push('goliath'); }
  if (value >= 1e10) tags.push('oof');
  if (!tags.length) return null;
  const score = Math.round(tags.reduce((n, t) => n + CATS[t].pts, 0) * (1 + Math.log10(Math.max(1e6, value) / 1e6) / 2));
  const fb = (km.attackers || []).find(x => x.final_blow) || {};
  return {
    id: km.killmail_id, time: km.killmail_time, value, cargoValue, systemId: km.solar_system_id, system: s ? s.name : null, security: s ? s.security : null, hs,
    victimId: v.character_id || null, corpId: v.corporation_id || null, allianceId: v.alliance_id || null, shipTypeId: v.ship_type_id, ship: ship.name, shipGroup: g,
    fitted: fitted.length, slots, attackers: players.length, npc: !!zkb.npc, finalShipTypeId: fb.ship_type_id || null, finalShip: fb.ship_type_id && T(fb.ship_type_id) ? T(fb.ship_type_id).name : null,
    tags: tags.map(t => ({ id: t, ...CATS[t] })), score
  };
}

const cache = new Map();

/**
 * opts: { period: 'day' | 'week', scope: 'all' | 'mine', zone: 'all' | 'hs' | 'ls' | 'ns' | 'wh' }
 */
async function wall(opts = {}, onProgress = () => {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const seconds = opts.period === 'week' ? 604800 : 86400;
  const scope = opts.scope === 'mine' ? 'mine' : 'all';
  const key = `${seconds}:${scope}`;
  const hit = cache.get(key);
  let rows;
  if (hit && Date.now() - hit.at < 30 * 60000) rows = hit.rows;
  else {
    const lists = [];
    if (scope === 'mine') {
      const ids = new Map();
      for (const c of store.get().characters.filter(x => !x.needsReauth)) {
        const r = await safe(() => get(`/characters/${c.id}/`));
        if (ok(r)) { if (r.alliance_id) ids.set('allianceID:' + r.alliance_id, r.alliance_id); else ids.set('corporationID:' + r.corporation_id, r.corporation_id); }
      }
      if (!ids.size) throw new Error('Add a pilot first.');
      let i = 0;
      for (const [k, id] of ids) { onProgress(++i, ids.size + 1, 'zKillboard'); lists.push(...(await zk(`/losses/${k.split(':')[0]}/${id}/pastSeconds/${seconds}/`, 600000).catch(() => []) || [])); }
    } else {
      let i = 0;
      for (const gid of SCAN) { onProgress(++i, SCAN.length + 1, 'zKillboard'); const l = await zk(`/losses/groupID/${gid}/pastSeconds/${seconds}/`, 600000).catch(() => []); if (Array.isArray(l)) lists.push(...l); }
    }
    // Keep the likeliest candidates: expensive, NPC, awox, and a sample of the rest (to catch bad fits)
    const uniq = new Map(); for (const k of lists) if (k && k.killmail_id) uniq.set(k.killmail_id, k);
    const all = [...uniq.values()];
    const pick = new Map();
    for (const k of [...all].sort((a, b) => (b.zkb.totalValue || 0) - (a.zkb.totalValue || 0)).slice(0, 70)) pick.set(k.killmail_id, k);
    for (const k of all.filter(k => k.zkb && (k.zkb.npc || k.zkb.awox || k.zkb.solo)).slice(0, 40)) pick.set(k.killmail_id, k);
    for (const k of all.filter((_, i) => i % 7 === 0).slice(0, 40)) pick.set(k.killmail_id, k);
    const cand = [...pick.values()].slice(0, 150);
    rows = [];
    for (let i = 0; i < cand.length; i += 10) {
      onProgress(i, cand.length, 'killmails');
      const b = await Promise.all(cand.slice(i, i + 10).map(k => safe(() => get(`/killmails/${k.killmail_id}/${k.zkb.hash}/`))));
      b.forEach((km, j) => { if (ok(km)) { const r = analyse(km, cand[i + j].zkb || {}); if (r) rows.push(r); } });
    }
    const ids = [...new Set(rows.flatMap(r => [r.victimId, r.corpId, r.allianceId]).filter(Boolean))];
    const names = ids.length ? await resolveNames(ids).catch(() => ({})) : {};
    for (const r of rows) { r.victim = names[r.victimId] || null; r.corp = names[r.corpId] || null; r.alliance = r.allianceId ? names[r.allianceId] || null : null; }
    cache.set(key, { at: Date.now(), rows });
  }
  const zoneOk = r => {
    if (!opts.zone || opts.zone === 'all') return true;
    const s = sde.system(r.systemId); if (!s) return false;
    const c = Number(s.whClass) || 0;
    const z = (c >= 1 && c <= 6) || c >= 12 ? 'wh' : Math.round(s.security * 10) / 10 >= 0.5 ? 'hs' : s.security > 0 ? 'ls' : 'ns';
    return z === opts.zone;
  };
  const list = rows.filter(zoneOk);
  const byPilot = new Map(), byCorp = new Map();
  for (const r of list) {
    if (r.victimId) { const p = byPilot.get(r.victimId) || { id: r.victimId, name: r.victim, corp: r.corp, losses: 0, isk: 0, score: 0, tags: new Map() }; p.losses++; p.isk += r.value; p.score += r.score; for (const t of r.tags) p.tags.set(t.label, (p.tags.get(t.label) || 0) + 1); byPilot.set(r.victimId, p); }
    const cid = r.allianceId || r.corpId; if (cid) { const c = byCorp.get(cid) || { id: cid, name: r.alliance || r.corp, alliance: !!r.allianceId, losses: 0, isk: 0, score: 0 }; c.losses++; c.isk += r.value; c.score += r.score; byCorp.set(cid, c); }
  }
  const catCount = {};
  for (const r of list) for (const t of r.tags) catCount[t.id] = (catCount[t.id] || 0) + 1;
  return {
    period: seconds === 604800 ? 'week' : 'day', scope, zone: opts.zone || 'all', at: new Date((cache.get(key) || {}).at || Date.now()).toISOString(),
    shame: [...list].sort((a, b) => b.score - a.score).slice(0, 40),
    oofs: [...list].sort((a, b) => b.value - a.value).slice(0, 10),
    offenders: [...byPilot.values()].map(p => ({ ...p, tags: [...p.tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3) })).sort((a, b) => b.score - a.score).slice(0, 10),
    feeders: [...byCorp.values()].sort((a, b) => b.isk - a.isk).slice(0, 10),
    categories: Object.entries(CATS).map(([id, c]) => ({ id, ...c, count: catCount[id] || 0 })).filter(c => c.count)
  };
}

module.exports = { wall, analyse, CATS };
