'use strict';
/* Pilot intel: public profile from ESI + zKillboard, a threat grade, and a local watchlist.
 * Everything here uses public data only (no tokens), except standings, which come from your own pilots' contacts. */

const store = require('./store');
const sde = require('./sde');
const { get, rawRequest, safe, ok, resolveNames } = require('./esi');

const { zk } = require('./zkill');
const CONCORD_CORP = 1000125, CONCORD_FACTION = 500006;
const CYNO_TYPES = new Set([21096, 28650, 52694]); // Cynosural Field Generator I, Covert Cynosural Field Generator I, Industrial Cynosural Field Generator
const GANK_HULLS = ['Catalyst', 'Thrasher', 'Coercer', 'Cormorant', 'Algos', 'Talwar', 'Dragoon', 'Corax', 'Catalyst Navy Issue', 'Thrasher Fleet Issue', 'Coercer Navy Issue', 'Cormorant Navy Issue',
  'Talos', 'Tornado', 'Oracle', 'Naga', 'Kikimora', 'Draugur', 'Brutix', 'Hurricane'];
const GROUP_FLAGS = {
  'Interdictor': 'bubbler', 'Heavy Interdiction Cruiser': 'bubbler',
  'Black Ops': 'blops', 'Force Recon Ship': 'cloaky', 'Covert Ops': 'cloaky', 'Stealth Bomber': 'cloaky', 'Strategic Cruiser': 'cloaky',
  'Carrier': 'capital', 'Dreadnought': 'capital', 'Lancer Dreadnought': 'capital', 'Force Auxiliary': 'capital', 'Supercarrier': 'super', 'Titan': 'super'
};
const FLAG_INFO = {
  ganker: { label: 'Highsec ganker', tone: 'red', why: 'Loses ships to CONCORD in highsec, or kills in highsec with gank hulls and negative security status.' },
  hotdrop: { label: 'Hotdropper', tone: 'red', why: 'Kills involve Black Ops or capitals jumping in on targets.' },
  cyno: { label: 'Cyno pilot', tone: 'red', why: 'Has lost ships fitted with a cynosural field generator.' },
  blops: { label: 'Black Ops', tone: 'red', why: 'Flies Black Ops battleships.' },
  super: { label: 'Supercapital pilot', tone: 'red', why: 'Has flown a supercarrier or titan on kills.' },
  capital: { label: 'Capital pilot', tone: 'gold', why: 'Has flown carriers, dreadnoughts or FAX on kills.' },
  bubbler: { label: 'Bubbler', tone: 'gold', why: 'Flies interdictors or HICs that hold you in warp bubbles.' },
  cloaky: { label: 'Cloaky hunter', tone: 'gold', why: 'Flies covert ops, recons, bombers or T3 cruisers.' },
  solo: { label: 'Solo hunter', tone: 'gold', why: 'A large share of kills are solo.' },
  active: { label: 'Active now', tone: 'red', why: 'Got a kill in the last 48 hours.' },
  outlaw: { label: 'Outlaw', tone: 'gold', why: 'Security status is -5.0 or lower, so anyone can shoot them in highsec.' },
  criminalish: { label: 'Negative sec', tone: '', why: 'Security status below -2.0.' },
  fresh: { label: 'New character', tone: '', why: 'Under 90 days old. Often an alt, scout or cyno.' },
  red: { label: 'Red to you', tone: 'red', why: 'One of your pilots has them, their corp or alliance at negative standing.' },
  blue: { label: 'Blue to you', tone: 'accent', why: 'One of your pilots has them, their corp or alliance at positive standing.' },
  watch: { label: 'On your watchlist', tone: 'red', why: 'You tagged this pilot.' }
};
const LEVELS = [[75, 'Extreme', 'red'], [50, 'High', 'red'], [25, 'Moderate', 'gold'], [10, 'Low', ''], [0, 'Minimal', 'green']];
const levelFor = s => { const l = LEVELS.find(([min]) => s >= min); return { level: l[1], tone: l[2] }; };

const mem = new Map(); // id -> { at, full, data }
const TTL_FULL = 6 * 3600000, TTL_QUICK = 2 * 3600000;

function zoneOf(systemId) {
  if (!sde.ready()) return null;
  const s = sde.system(systemId);
  if (!s) return null;
  if (s.region === 'Pochven') return 'pochven';
  const c = Number(s.whClass) || 0;
  if ((c >= 1 && c <= 6) || (c >= 12 && c <= 18)) return 'wh';
  const sec = Math.round(s.security * 10) / 10;
  return sec >= 0.5 ? 'hs' : sec > 0 ? 'ls' : 'ns';
}
const groupOf = typeId => (sde.ready() && sde.type(typeId)) ? sde.type(typeId).group : null;
const nameOf = typeId => (sde.ready() && sde.type(typeId)) ? sde.type(typeId).name : null;

async function resolveCharacter(q) {
  if (/^\d{6,12}$/.test(String(q).trim())) return Number(q);
  const name = String(q).trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Enter a pilot name.');
  const r = await rawRequest('/universe/ids/', { method: 'POST', body: [name] });
  const c = (r.body && r.body.characters) || [];
  if (!c.length) throw new Error(`No pilot called "${name}" was found.`);
  return c[0].id;
}

/** Your pilots' standings toward a character / corp / alliance. Cached for 15 minutes. */
let standCache = { at: 0, map: new Map() };
async function standings() {
  if (Date.now() - standCache.at < 900000) return standCache.map;
  const map = new Map();
  for (const ch of store.get().characters.filter(x => !x.needsReauth)) {
    const r = await safe(() => get(`/characters/${ch.id}/contacts/`, ch.id));
    if (ok(r)) for (const c of r) { const cur = map.get(c.contact_id); if (cur === undefined || Math.abs(c.standing) > Math.abs(cur)) map.set(c.contact_id, c.standing); }
  }
  standCache = { at: Date.now(), map };
  return map;
}

const watch = () => { const d = store.get(); if (!d.pilotWatch) d.pilotWatch = {}; return d.pilotWatch; };

/** Core scoring. Inputs are what we know; missing pieces simply don't contribute. Returns explainable reasons. */
function grade({ ch, stats, kills = [], losses = [], standing = null, watchTag = null, full }) {
  const reasons = [];
  const flags = new Set();
  let score = 0;
  const add = (pts, text) => { if (pts) { score += pts; reasons.push({ pts: Math.round(pts), text }); } };
  const s = stats || {};
  const totalKills = s.shipsDestroyed || 0, totalLosses = s.shipsLost || 0;

  // Recent activity from monthly totals
  const months = s.months ? Object.entries(s.months).sort((a, b) => b[0].localeCompare(a[0])) : [];
  const now = new Date();
  const key = d => d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
  const recentKeys = new Set([0, 1, 2].map(i => String(key(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))))));
  const kills90 = months.filter(([k]) => recentKeys.has(k)).reduce((n, [, m]) => n + (m.shipsDestroyed || 0), 0);
  const lastKillAt = kills.length ? Math.max(...kills.map(k => Date.parse(k.time) || 0)) : null;
  const lastAge = lastKillAt ? (Date.now() - lastKillAt) / 86400000 : null;

  if (lastAge !== null) {
    if (lastAge < 2) { add(20, 'Got a kill in the last 48 hours'); flags.add('active'); }
    else if (lastAge < 7) add(15, 'Got a kill this week');
    else if (lastAge < 30) add(8, 'Got a kill this month');
    else if (lastAge < 90) add(3, 'Got a kill in the last 3 months');
    else add(-5, `Last kill was ${Math.round(lastAge)} days ago`);
  } else if (kills90) add(8, 'Active in the last 3 months');

  if (kills90) add(Math.min(20, Math.log10(kills90 + 1) * 9), `${kills90} kills in the last 3 months`);
  else if (totalKills && lastAge === null) add(-5, 'No kills in the last 3 months');

  if (s.dangerRatio !== undefined && s.dangerRatio !== null && totalKills >= 5) add(Math.max(0, (s.dangerRatio - 30) * 0.25), `zKillboard danger ratio ${s.dangerRatio}%`);
  if (totalKills >= 20 && (s.soloKills || 0) / totalKills > 0.2) { add(8, `${Math.round(100 * s.soloKills / totalKills)}% of kills are solo`); flags.add('solo'); }
  if (totalKills < 5 && !kills90) reasons.push({ pts: 0, text: stats ? 'Little or no killboard history' : 'No zKillboard data available' });

  // Ships flown, systems, gank / hotdrop evidence from killmails
  const shipCount = new Map(), zoneKills = { hs: 0, ls: 0, ns: 0, wh: 0, pochven: 0 };
  let hotdrops = 0, hsGankKills = 0, concordLosses = 0, cynoLosses = 0;
  const gankIds = new Set(GANK_HULLS.map(n => sde.ready() ? sde.typeIdByName(n) : null).filter(Boolean));
  for (const k of kills) {
    if (k.ship) shipCount.set(k.ship, (shipCount.get(k.ship) || 0) + 1);
    const z = zoneOf(k.systemId); if (z) zoneKills[z]++;
    if (k.attackerGroups && k.attackerGroups.some(g => ['Black Ops', 'Carrier', 'Dreadnought', 'Lancer Dreadnought', 'Supercarrier', 'Titan', 'Force Auxiliary'].includes(g)) && k.victimGroup && !['Carrier', 'Dreadnought', 'Supercarrier', 'Titan', 'Force Auxiliary', 'Citadel', 'Engineering Complex', 'Refinery'].includes(k.victimGroup)) hotdrops++;
    if (z === 'hs' && gankIds.has(k.ship) && (k.attackers || 0) >= 2) hsGankKills++;
  }
  for (const l of losses) {
    if (zoneOf(l.systemId) === 'hs' && l.concord) concordLosses++;
    if (l.cyno) cynoLosses++;
  }
  // zKill all-time top ships fill in when we don't have killmail detail
  const topShips = s.topAllTime ? ((s.topAllTime.find(t => t.type === 'ship') || {}).data || []) : [];
  if (!shipCount.size) for (const t of topShips.slice(0, 10)) shipCount.set(t.shipTypeID, t.kills);
  for (const [id] of shipCount) { const g = groupOf(id); if (g && GROUP_FLAGS[g]) flags.add(GROUP_FLAGS[g]); }
  if (!kills.length) {
    const topSys = s.topAllTime ? ((s.topAllTime.find(t => t.type === 'system') || {}).data || []) : [];
    for (const t of topSys.slice(0, 10)) { const z = zoneOf(t.solarSystemID); if (z) zoneKills[z] += t.kills; }
  }

  if (flags.has('blops')) add(8, 'Flies Black Ops');
  if (flags.has('super')) add(8, 'Flies supercapitals');
  else if (flags.has('capital')) add(5, 'Flies capitals');
  if (flags.has('bubbler')) add(4, 'Flies interdictors or HICs');
  if (flags.has('cloaky')) add(4, 'Flies cloaky hunters');
  if (hotdrops) { flags.add('hotdrop'); add(Math.min(14, 6 + hotdrops * 2), `${hotdrops} recent kill${hotdrops > 1 ? 's' : ''} with Black Ops or capitals jumping in`); }
  if (cynoLosses) { flags.add('cyno'); add(8, `Lost ${cynoLosses} ship${cynoLosses > 1 ? 's' : ''} fitted with a cyno`); }

  const sec = ch && typeof ch.security_status === 'number' ? ch.security_status : null;
  if (sec !== null && sec <= -5) { flags.add('outlaw'); add(5, `Security status ${sec.toFixed(1)}`); }
  else if (sec !== null && sec < -2) { flags.add('criminalish'); add(3, `Security status ${sec.toFixed(1)}`); }

  // Highsec gank score (separate, then folded into the highsec zone)
  let gank = 0;
  const zTotal = Object.values(zoneKills).reduce((a, b) => a + b, 0) || 0;
  const hsShare = zTotal ? zoneKills.hs / zTotal : 0;
  if (concordLosses) gank += Math.min(45, 20 + concordLosses * 5);
  if (hsGankKills) gank += Math.min(30, 10 + hsGankKills * 4);
  if (!full && sec !== null && sec < -2 && hsShare >= 0.3) gank += 20;
  if (!full && hsShare >= 0.5 && [...shipCount.keys()].some(id => gankIds.has(id))) gank += 15;
  if (sec !== null && sec < -2 && hsShare > 0) gank += 10;
  if (gank >= 25) {
    flags.add('ganker');
    reasons.push({ pts: 0, text: concordLosses ? `Lost ${concordLosses} ship${concordLosses > 1 ? 's' : ''} to CONCORD in highsec (suicide ganking)` : hsGankKills ? `${hsGankKills} highsec kills in gank ships` : 'Highsec kills with negative security status' });
  }

  // Standings and your own tags
  if (standing !== null && standing < 0) { flags.add('red'); add(10, `Red to you (${standing})`); }
  if (standing !== null && standing > 0) { flags.add('blue'); add(-40, `Blue to you (+${standing})`); }
  if (watchTag === 'hostile' || watchTag === 'ganker') { flags.add('watch'); add(15, `You tagged them as ${watchTag}`); if (watchTag === 'ganker') gank = Math.max(gank, 60); }
  if (watchTag === 'friendly') add(-40, 'You tagged them as friendly');

  if (ch && ch.birthday && (Date.now() - Date.parse(ch.birthday)) / 86400000 < 90) flags.add('fresh');

  score = Math.max(0, Math.min(100, score));
  gank = Math.max(0, Math.min(100, gank));
  if (flags.has('blue') || watchTag === 'friendly') { score = Math.min(score, 9); gank = Math.min(gank, 9); }
  const share = z => (zTotal ? zoneKills[z] / zTotal : 0);
  const zones = {};
  for (const z of ['hs', 'ls', 'ns', 'wh', 'pochven']) {
    let v = score * (zTotal ? 0.45 + 0.55 * Math.min(1, share(z) * 2) : 1);
    if (z === 'hs') v = Math.max(v * (zTotal ? 1 : 0.6), gank);
    zones[z] = { score: Math.round(Math.max(0, Math.min(100, v))), ...levelFor(v), share: Math.round(share(z) * 100) };
  }
  const overall = Math.round(Math.max(score, gank));
  return {
    score: overall, ...levelFor(overall), pvpScore: Math.round(score), gankScore: Math.round(gank), zones, zoneKills,
    flags: [...flags].map(f => ({ id: f, ...FLAG_INFO[f] })).sort((a, b) => (b.tone === 'red') - (a.tone === 'red')),
    reasons: reasons.filter(r => r.text).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)),
    topShips: [...shipCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ typeId: id, name: nameOf(id), group: groupOf(id), kills: n })),
    kills90, lastKillAt: lastKillAt ? new Date(lastKillAt).toISOString() : null, concordLosses, hotdrops
  };
}

function summarise(km, charId, isLoss) {
  const me = isLoss ? km.victim : (km.attackers || []).find(a => a.character_id === charId) || {};
  const groups = [...new Set((km.attackers || []).map(a => groupOf(a.ship_type_id)).filter(Boolean))];
  return {
    id: km.killmail_id, time: km.killmail_time, systemId: km.solar_system_id, system: sde.ready() && sde.system(km.solar_system_id) ? sde.system(km.solar_system_id).name : null,
    zone: zoneOf(km.solar_system_id), ship: me.ship_type_id || null, shipName: nameOf(me.ship_type_id),
    victimShip: km.victim && km.victim.ship_type_id, victimShipName: nameOf(km.victim && km.victim.ship_type_id), victimGroup: groupOf(km.victim && km.victim.ship_type_id),
    victimId: km.victim && km.victim.character_id, victimCorp: km.victim && km.victim.corporation_id, victimAlliance: (km.victim && km.victim.alliance_id) || null,
    attackers: (km.attackers || []).length, attackerGroups: groups,
    solo: (km.attackers || []).filter(a => a.character_id).length === 1,
    concord: isLoss && (km.attackers || []).some(a => a.corporation_id === CONCORD_CORP || a.faction_id === CONCORD_FACTION),
    cyno: isLoss && ((km.victim && km.victim.items) || []).some(i => CYNO_TYPES.has(i.item_type_id)),
    fleet: (() => { const m = new Map(); for (const x of km.attackers || []) if (x.ship_type_id) m.set(x.ship_type_id, (m.get(x.ship_type_id) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => ({ typeId: t, name: nameOf(t), n })); })(),
    pilots: (km.attackers || []).filter(x => x.character_id).sort((a, b) => (b.damage_done || 0) - (a.damage_done || 0)).slice(0, 10).map(x => ({ id: x.character_id, ship: x.ship_type_id || null, shipName: nameOf(x.ship_type_id), damage: x.damage_done || 0, finalBlow: !!x.final_blow })),
    damage: (km.victim && km.victim.damage_taken) || 0
  };
}

async function killDetails(list, charId, isLoss, max) {
  const out = [];
  const items = (Array.isArray(list) ? list : []).slice(0, max);
  for (let i = 0; i < items.length; i += 6) {
    const batch = await Promise.all(items.slice(i, i + 6).map(k => safe(() => get(`/killmails/${k.killmail_id}/${k.zkb && k.zkb.hash}/`))));
    batch.forEach((km, j) => { if (ok(km)) out.push({ ...summarise(km, charId, isLoss), value: items[i + j].zkb ? items[i + j].zkb.totalValue : null, fitted: items[i + j].zkb ? items[i + j].zkb.fittedValue || null : null, dropped: items[i + j].zkb ? items[i + j].zkb.droppedValue || null : null, awox: !!(items[i + j].zkb && items[i + j].zkb.awox) }); });
  }
  return out;
}

/** Full profile (for the Pilot Intel page). */
async function profile(q, { refresh = false } = {}) {
  const id = await resolveCharacter(q);
  const hit = mem.get(id);
  if (!refresh && hit && hit.full && Date.now() - hit.at < TTL_FULL) return { ...hit.data, cached: true };
  const [ch, hist, aff] = await Promise.all([get(`/characters/${id}/`), safe(() => get(`/characters/${id}/corporationhistory/`)), safe(() => rawRequest('/characters/affiliation/', { method: 'POST', body: [id] }))]);
  const af = ok(aff) && aff.body && aff.body[0] ? aff.body[0] : { corporation_id: ch.corporation_id, alliance_id: ch.alliance_id };
  const [corp, ally] = await Promise.all([safe(() => get(`/corporations/${af.corporation_id}/`)), af.alliance_id ? safe(() => get(`/alliances/${af.alliance_id}/`)) : null]);
  let stats = null, zkError = null, kills = [], losses = [];
  try {
    stats = await zk(`/stats/characterID/${id}/`);
    const kl = await zk(`/kills/characterID/${id}/`);
    const ll = await zk(`/losses/characterID/${id}/`);
    kills = await killDetails(kl, id, false, 30);
    losses = await killDetails(ll, id, true, 20);
  } catch (e) { zkError = e.message; }
  try {
    const ids = [...new Set([...kills, ...losses].flatMap(k => [k.victimId, ...(k.pilots || []).map(p => p.id)]).filter(Boolean))].slice(0, 600);
    const names = ids.length ? await resolveNames(ids) : {};
    for (const k of [...kills, ...losses]) { if (k.victimId) k.victimName = names[k.victimId] || null; for (const p of k.pilots || []) p.name = names[p.id] || null; }
  } catch {}
  const st = await standings();
  const standing = st.get(id) ?? st.get(af.corporation_id) ?? (af.alliance_id ? st.get(af.alliance_id) : undefined) ?? null;
  const w = watch()[id] || null;
  const g = grade({ ch, stats, kills, losses, standing, watchTag: w && w.tag, full: !zkError });
  const histList = ok(hist) ? hist : [];
  const histNames = await resolveNames([...new Set(histList.map(h => h.corporation_id))]).catch(() => ({}));
  const data = {
    id, name: ch.name, birthday: ch.birthday, security: ch.security_status ?? null, title: ch.title || null,
    bio: ch.description ? String(ch.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600) : '',
    corporation: ok(corp) ? { id: af.corporation_id, name: corp.name, ticker: corp.ticker, members: corp.member_count, warEligible: corp.war_eligible ?? null, npc: af.corporation_id < 2000000 } : { id: af.corporation_id },
    alliance: af.alliance_id && ok(ally) ? { id: af.alliance_id, name: ally.name, ticker: ally.ticker } : null,
    history: histList.slice(0, 15).map(h => ({ corporationId: h.corporation_id, name: histNames[h.corporation_id] || String(h.corporation_id), start: h.start_date })),
    fullHistory: histList.map(h => ({ corporationId: h.corporation_id, name: histNames[h.corporation_id] || String(h.corporation_id), start: h.start_date, deleted: !!h.is_deleted })),
    killsAll: kills,
    corpChanges: histList.length,
    stats: stats ? { kills: stats.shipsDestroyed || 0, losses: stats.shipsLost || 0, solo: stats.soloKills || 0, iskDestroyed: stats.iskDestroyed || 0, iskLost: stats.iskLost || 0, danger: stats.dangerRatio ?? null, gang: stats.gangRatio ?? null,
      activity: stats.activity || null } : null,
    zkError, standing, watch: w, kills: kills.slice(0, 20), losses: losses.slice(0, 12), ...g, at: new Date().toISOString(), sdeReady: sde.ready()
  };
  mem.set(id, { at: Date.now(), full: true, data });
  remember(data);
  return data;
}

/** Quick grade (one zKill call) for bulk use: Local scans and intel reports. */
async function quick(id, name) {
  const hit = mem.get(id);
  if (hit && Date.now() - hit.at < (hit.full ? TTL_FULL : TTL_QUICK)) return brief(hit.data);
  const ch = await safe(() => get(`/characters/${id}/`));
  let stats = null;
  try { stats = await zk(`/stats/characterID/${id}/`); } catch { /* grade from what we have */ }
  const st = await standings();
  const chd = ok(ch) ? ch : {};
  const standing = st.get(id) ?? st.get(chd.corporation_id) ?? (chd.alliance_id ? st.get(chd.alliance_id) : undefined) ?? null;
  const w = watch()[id] || null;
  const g = grade({ ch: chd, stats, standing, watchTag: w && w.tag, full: false });
  const data = { id, name: chd.name || name, security: chd.security_status ?? null, birthday: chd.birthday, standing, watch: w,
    stats: stats ? { kills: stats.shipsDestroyed || 0, losses: stats.shipsLost || 0, danger: stats.dangerRatio ?? null } : null, ...g, quick: true };
  mem.set(id, { at: Date.now(), full: false, data });
  return brief(data);
}

const brief = d => ({ id: d.id, name: d.name, score: d.score, level: d.level, tone: d.tone, gankScore: d.gankScore, zones: d.zones, flags: d.flags.map(f => ({ id: f.id, label: f.label, tone: f.tone })),
  kills: d.stats ? d.stats.kills : 0, security: d.security, watch: d.watch, standing: d.standing });

async function quickMany(pilots, onProgress) {
  const out = {};
  let i = 0;
  for (const p of pilots.slice(0, 80)) {
    try { out[p.id] = await quick(p.id, p.name); } catch { /* skip */ }
    if (onProgress) onProgress(++i, Math.min(pilots.length, 80));
  }
  return out;
}

function remember(d) {
  const data = store.get();
  const list = (data.pilotRecent || []).filter(x => x.id !== d.id);
  list.unshift({ id: d.id, name: d.name, score: d.score, level: d.level, tone: d.tone, at: d.at });
  data.pilotRecent = list.slice(0, 30);
  store.save();
}

function setWatch(id, name, tag, note) {
  const w = watch();
  if (!tag) delete w[id];
  else w[id] = { name, tag, note: String(note || '').slice(0, 300), added: (w[id] && w[id].added) || new Date().toISOString() };
  store.save();
  mem.delete(Number(id));
  return w;
}

/** Find pilot names in free text (intel reports). Uses double-space separators when present, else word n-grams. */
const STOP = new Set(['nv', 'no', 'visual', 'clr', 'clear', 'cleared', 'red', 'reds', 'hostile', 'hostiles', 'neut', 'neuts', 'gang', 'fleet', 'gate', 'in', 'on', 'at', 'to', 'the', 'and', 'or', 'is', 'a', 'x',
  'status', 'local', 'spike', 'camp', 'camping', 'bubble', 'bubbled', 'cloaky', 'cyno', 'dock', 'docked', 'undock', 'jumped', 'jump', 'out', 'inc', 'incoming', 'moving', 'heading', 'towards', 'via', 'plus', 'more', 'some', 'with']);
function candidates(text, systemNames) {
  const sys = new Set(systemNames.map(s => s.toLowerCase()));
  const parts = /\S\s{2,}\S/.test(text) ? text.split(/\s{2,}/) : null;
  const out = new Set();
  const isItem = n => sde.ready() && !!sde.typeIdByName(n);
  const okName = s => s.length >= 3 && s.length <= 37 && !sys.has(s.toLowerCase()) && !STOP.has(s.toLowerCase()) && !/^[+\-\d.,x*]+$/i.test(s) && /[a-z]/i.test(s) && !isItem(s);
  if (parts) for (const p of parts) { const s = p.trim().replace(/[*,]+$/, ''); if (okName(s)) out.add(s); }
  const words = text.split(/\s+/).map(w => w.replace(/^[^\w'-]+|[^\w'-]+$/g, '')).filter(Boolean);
  for (let n = 3; n >= 1; n--) for (let i = 0; i + n <= words.length; i++) {
    const seg = words.slice(i, i + n);
    if (seg.some(w => sys.has(w.toLowerCase()))) continue;
    if (n === 1 && (STOP.has(seg[0].toLowerCase()) || seg[0].length < 4)) continue;
    const s = seg.join(' ');
    if (okName(s)) out.add(s);
  }
  return [...out].slice(0, 60);
}

async function namesInText(text, systemNames = []) {
  const c = candidates(text, systemNames);
  if (!c.length) return [];
  const r = await rawRequest('/universe/ids/', { method: 'POST', body: c });
  const found = ((r.body && r.body.characters) || []);
  // Prefer the longest matches and drop single words already covered by a longer match
  found.sort((a, b) => b.name.length - a.name.length);
  const picked = [];
  for (const f of found) if (!picked.some(p => p.name.toLowerCase().includes(f.name.toLowerCase()))) picked.push(f);
  return picked.slice(0, 8);
}

/** Recruitment vetting: how likely is this applicant to be a spy, awoxer or throwaway alt? */
const corpInfoCache = new Map();
async function corpInfo(id) {
  if (corpInfoCache.has(id)) return corpInfoCache.get(id);
  const r = await safe(() => get(`/corporations/${id}/`));
  const v = ok(r) ? { name: r.name, allianceId: r.alliance_id || null, members: r.member_count } : null;
  corpInfoCache.set(id, v);
  return v;
}

async function vet(q, { directorId } = {}) {
  const p = await profile(q);
  let myCorp = null, myAlliance = null;
  const me = directorId ? store.get().characters.find(c => c.id === Number(directorId)) : store.get().characters[0];
  if (me) { const r = await safe(() => get(`/characters/${me.id}/`)); if (ok(r)) { myCorp = r.corporation_id; myAlliance = r.alliance_id || null; } }
  const st = await standings();
  const reasons = [];
  let risk = 0;
  const add = (pts, text, tone) => { risk += pts; reasons.push({ pts, text, tone: tone || (pts >= 15 ? 'red' : pts > 0 ? 'gold' : 'green') }); };

  // Employment pattern (newest first)
  const hist = [...(p.fullHistory || [])].sort((a, b) => b.start.localeCompare(a.start));
  const stays = hist.map((h, i) => ({ ...h, days: ((i ? Date.parse(hist[i - 1].start) : Date.now()) - Date.parse(h.start)) / 86400000, npc: h.corporationId < 2000000 }));
  const playerStays = stays.filter(x => !x.npc);
  const lastYear = playerStays.filter(x => Date.now() - Date.parse(x.start) < 365 * 86400000).length;
  const short = playerStays.slice(1).filter(x => x.days < 30).length; // finished stays under a month
  if (lastYear >= 6) add(20, `${lastYear} player corps in the last year`);
  else if (lastYear >= 4) add(10, `${lastYear} player corps in the last year`);
  if (short >= 3) add(15, `${short} past corps left within a month`);
  else if (short) add(5, `${short} past corp${short > 1 ? 's' : ''} left within a month`);
  const avg = playerStays.length > 1 ? playerStays.slice(1).reduce((n, x) => n + x.days, 0) / (playerStays.length - 1) : null;
  if (avg !== null && avg > 365) add(-8, `Stays a long time in corps (average ${Math.round(avg / 30)} months)`);

  // Age
  const age = p.birthday ? (Date.now() - Date.parse(p.birthday)) / 86400000 : null;
  if (age !== null && age < 30) add(20, `Character is only ${Math.round(age)} days old`);
  else if (age !== null && age < 120) add(10, `Character is ${Math.round(age)} days old`);
  else if (age !== null && age > 3 * 365) add(-5, `Character is ${(age / 365).toFixed(1)} years old`);

  // Current and past ties to people you're red to
  const sOf = id => (id ? st.get(id) : undefined);
  const curStanding = sOf(p.corporation.id) ?? (p.alliance ? sOf(p.alliance.id) : undefined);
  if (curStanding !== undefined && curStanding < 0) add(35, `Currently in ${p.alliance ? p.alliance.name : p.corporation.name}, which you're red to (${curStanding})`);
  const pastRed = [];
  for (const h of playerStays.slice(1, 11)) {
    const ci = await corpInfo(h.corporationId);
    const sv = sOf(h.corporationId) ?? (ci && ci.allianceId ? sOf(ci.allianceId) : undefined);
    if (sv !== undefined && sv < 0) pastRed.push(h.name);
  }
  if (pastRed.length) add(Math.min(30, 12 * pastRed.length), `Previously in corps you're red to: ${pastRed.slice(0, 3).join(', ')}`);

  // Killboard: awoxing and kills on you / your blues
  const ks = p.killsAll || p.kills || [];
  const awox = ks.filter(k => k.awox).length;
  if (awox) add(Math.min(40, 20 + awox * 5), `${awox} awox kill${awox > 1 ? 's' : ''} (killing their own corp members)`);
  const onUs = ks.filter(k => (myCorp && k.victimCorp === myCorp) || (myAlliance && k.victimAlliance === myAlliance)).length;
  if (onUs) add(Math.min(40, 20 + onUs * 5), `Killed ${onUs} member${onUs > 1 ? 's' : ''} of your ${myAlliance ? 'alliance' : 'corp'} recently`);
  const onBlues = ks.filter(k => (sOf(k.victimCorp) || 0) > 0 || (sOf(k.victimAlliance) || 0) > 0).length;
  if (onBlues) add(Math.min(20, 8 + onBlues * 3), `Killed ${onBlues} pilot${onBlues > 1 ? 's' : ''} you're blue with`);
  if (p.flags.some(f => f.id === 'ganker')) add(10, 'Suicide-ganks in highsec (security status and CONCORD)');
  if (p.watch && ['hostile', 'ganker'].includes(p.watch.tag)) add(30, `On your watchlist as ${p.watch.tag}${p.watch.note ? ': ' + p.watch.note : ''}`);
  if (p.watch && p.watch.tag === 'friendly') add(-15, 'Tagged friendly on your watchlist');
  if (p.stats && p.stats.kills + p.stats.losses === 0 && age !== null && age > 365) add(8, 'Old character with no killboard history at all (possible hidden alt)');
  if (p.stats && p.stats.kills > 50) add(-5, `Active PvP record (${p.stats.kills} kills)`);

  risk = Math.max(0, Math.min(100, risk));
  const verdict = risk >= 50 ? { label: 'High risk', tone: 'red', advice: 'Treat as a likely spy or awoxer. Ask for a full audit and voice interview, and keep roles and hangar access minimal.' }
    : risk >= 25 ? { label: 'Review', tone: 'gold', advice: 'Some warning signs. Ask about the flagged points and check the audit before accepting.' }
    : { label: 'Looks OK', tone: 'green', advice: 'Nothing alarming in the public record. Still check the audit for skills and alts.' };
  return {
    id: p.id, name: p.name, risk, ...verdict, reasons: reasons.sort((a, b) => b.pts - a.pts),
    stays: stays.slice(0, 15).map(x => ({ name: x.name, start: x.start, days: Math.round(x.days), npc: x.npc })), threat: { score: p.score, level: p.level, tone: p.tone }, myCorp, myAlliance, at: new Date().toISOString()
  };
}

module.exports = { vet, profile, quick, quickMany, setWatch, watch, namesInText, candidates, grade, FLAG_INFO, LEVELS, recent: () => store.get().pilotRecent || [] };
