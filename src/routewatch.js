'use strict';
/* Route safety: recent kills on each system of a route, turned into gate-camp and gank warnings. */
const sde = require('./sde');
const store = require('./store');
const { get, safe, ok, resolveNames } = require('./esi');
const { zk } = require('./zkill');

const CONCORD_CORP = 1000125, CONCORD_FACTION = 500006;
const GANK_HULLS = new Set(['Catalyst', 'Thrasher', 'Coercer', 'Cormorant', 'Algos', 'Talwar', 'Dragoon', 'Corax', 'Catalyst Navy Issue', 'Thrasher Fleet Issue', 'Coercer Navy Issue', 'Cormorant Navy Issue', 'Talos', 'Tornado', 'Oracle', 'Naga', 'Kikimora', 'Draugur']);
const HAULERS = new Set(['Freighter', 'Jump Freighter', 'Hauler', 'Deep Space Transport', 'Blockade Runner', 'Industrial Command Ship', 'Exhumer', 'Mining Barge']);
const BUBBLERS = new Set(['Interdictor', 'Heavy Interdiction Cruiser']);
const POD_GROUPS = new Set(['Capsule', 'Shuttle', 'Corvette']);

const typeName = id => (sde.ready() && sde.type(id)) ? sde.type(id).name : null;
const typeGroup = id => (sde.ready() && sde.type(id)) ? sde.type(id).group : null;

const gateCache = new Map();
async function gateDest(id) {
  if (gateCache.has(id)) return gateCache.get(id);
  const g = await safe(() => get(`/universe/stargates/${id}/`));
  const v = ok(g) ? { id, system: g.system_id, dest: g.destination && g.destination.system_id, name: g.name } : null;
  gateCache.set(id, v);
  return v;
}
const stationCache = new Map();
async function stationName(id) {
  if (stationCache.has(id)) return stationCache.get(id);
  const c = id >= 1e12 ? store.get().characters.find(x => !x.needsReauth && (x.scopes || []).includes('esi-universe.read_structures.v1')) : null;
  const s = await safe(() => get(id >= 1e12 ? `/universe/structures/${id}/` : `/universe/stations/${id}/`, c ? c.id : undefined));
  const v = ok(s) ? s.name : null;
  stationCache.set(id, v);
  return v;
}
const sysName = id => (sde.ready() && sde.system(id)) ? sde.system(id).name : String(id);

async function where(locationId, systemId) {
  if (!locationId) return { kind: 'space', label: 'in space' };
  if (locationId >= 50000000 && locationId < 60000000) {
    const g = await gateDest(locationId);
    return g ? { kind: 'gate', id: locationId, dest: g.dest, label: `${sysName(g.dest)} gate` } : { kind: 'gate', id: locationId, label: 'a stargate' };
  }
  if ((locationId >= 60000000 && locationId < 64000000) || locationId >= 1e12) {
    const n = await stationName(locationId);
    return { kind: 'station', id: locationId, label: n ? `${n.replace(sysName(systemId) + ' ', '')} undock` : 'a station undock' };
  }
  return { kind: 'space', id: locationId, label: 'in space (planet, belt or site)' };
}

async function systemReport(systemId, hours, prevId, nextId) {
  const list = await zk(`/kills/solarSystemID/${systemId}/pastSeconds/${hours * 3600}/`, 120000);
  const items = (Array.isArray(list) ? list : []).slice(0, 15);
  const kills = [];
  for (let i = 0; i < items.length; i += 6) {
    const batch = await Promise.all(items.slice(i, i + 6).map(k => safe(() => get(`/killmails/${k.killmail_id}/${k.zkb && k.zkb.hash}/`))));
    for (let j = 0; j < batch.length; j++) {
      const km = batch[j]; if (!ok(km)) continue;
      const zkb = items[i + j].zkb || {};
      const players = (km.attackers || []).filter(a => a.character_id);
      kills.push({
        id: km.killmail_id, time: km.killmail_time, value: zkb.totalValue || 0, npc: !!zkb.npc, loc: await where(zkb.locationID, systemId),
        victimShip: km.victim.ship_type_id, victimShipName: typeName(km.victim.ship_type_id), victimGroup: typeGroup(km.victim.ship_type_id),
        attackers: players.length,
        concord: (km.attackers || []).some(a => a.corporation_id === CONCORD_CORP || a.faction_id === CONCORD_FACTION),
        attackerShips: players.map(a => a.ship_type_id).filter(Boolean),
        attackerIds: players.map(a => a.character_id), corps: players.map(a => a.alliance_id || a.corporation_id)
      });
    }
  }
  const pvp = kills.filter(k => !k.npc && !k.concord && k.attackers > 0);
  const s = sde.ready() ? sde.system(systemId) : null;
  const hs = s && Math.round(s.security * 10) / 10 >= 0.5;
  const now = Date.now();
  const minsAgo = t => Math.round((now - Date.parse(t)) / 60000);
  const hazards = [];

  // Gate and undock camps: 2+ player kills at the same spot
  const byLoc = new Map();
  for (const k of pvp) if (k.loc.kind !== 'space') { const key = k.loc.id || k.loc.label; const g = byLoc.get(key) || { loc: k.loc, kills: [] }; g.kills.push(k); byLoc.set(key, g); }
  for (const g of byLoc.values()) {
    if (g.kills.length < 2) continue;
    const latest = Math.min(...g.kills.map(k => minsAgo(k.time)));
    const onRoute = g.loc.kind === 'gate' && (g.loc.dest === prevId || g.loc.dest === nextId);
    const pods = g.kills.filter(k => POD_GROUPS.has(k.victimGroup)).length;
    const shipsUsed = g.kills.flatMap(k => k.attackerShips);
    const smartbomb = pods >= 2 && shipsUsed.some(id => /Battleship/.test(typeGroup(id) || ''));
    const bubbles = s && s.security <= 0 && shipsUsed.some(id => BUBBLERS.has(typeGroup(id)));
    hazards.push({
      type: g.loc.kind === 'gate' ? 'camp' : 'undock', severity: latest <= 30 ? 'danger' : 'warn', where: g.loc.label, onRoute,
      title: `${g.loc.kind === 'gate' ? 'Gate camp' : 'Undock camp'} at the ${g.loc.label}`,
      detail: `${g.kills.length} kills there, the latest ${latest} min ago${smartbomb ? '. Smartbombs likely: pods and shuttles are dying too' : ''}${bubbles ? '. Interdictors seen: expect bubbles' : ''}.`,
      latest, count: g.kills.length, smartbomb, bubbles
    });
  }

  // Highsec ganking: CONCORD killing the attackers, or gank hulls ganging up on a hauler / miner / expensive ship
  if (hs) {
    const concordKills = kills.filter(k => k.concord).length;
    const gankKills = pvp.filter(k => k.attackers >= 3 && (k.attackerShips.some(id => GANK_HULLS.has(typeName(id))) || HAULERS.has(k.victimGroup)));
    if (concordKills || gankKills.length) {
      const latest = Math.min(...[...kills.filter(k => k.concord), ...gankKills].map(k => minsAgo(k.time)));
      const targets = [...new Set(gankKills.map(k => k.victimGroup).filter(Boolean))];
      hazards.push({
        type: 'gank', severity: latest <= 45 ? 'danger' : 'warn', title: 'Suicide ganking',
        detail: `${gankKills.length} gank kill${gankKills.length === 1 ? '' : 's'}${concordKills ? ` and ${concordKills} ganker ship${concordKills === 1 ? '' : 's'} killed by CONCORD` : ''}, latest ${latest} min ago.${targets.length ? ' Targets: ' + targets.slice(0, 3).join(', ') + '.' : ''} Don't autopilot through here. Fly aligned, use a webbing alt or wait it out.`,
        latest, count: gankKills.length + concordKills
      });
    }
  }

  // General activity if nothing more specific
  if (!hazards.length && pvp.length) {
    const latest = Math.min(...pvp.map(k => minsAgo(k.time)));
    hazards.push({ type: 'activity', severity: latest <= 20 && pvp.length >= 2 ? 'warn' : 'info', title: 'Recent PvP', detail: `${pvp.length} player kill${pvp.length === 1 ? '' : 's'}, the latest ${latest} min ago.`, latest, count: pvp.length });
  }

  // Who is doing it
  const groupCount = new Map();
  for (const k of pvp) for (const c of new Set(k.corps)) groupCount.set(c, (groupCount.get(c) || 0) + 1);
  const topGroups = [...groupCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const names = topGroups.length ? await resolveNames(topGroups.map(g => g[0])).catch(() => ({})) : {};
  const shipCount = new Map();
  for (const k of pvp) for (const id of new Set(k.attackerShips)) shipCount.set(id, (shipCount.get(id) || 0) + 1);
  const pilotCount = new Map();
  for (const k of pvp) for (const id of new Set(k.attackerIds)) pilotCount.set(id, (pilotCount.get(id) || 0) + 1);

  return {
    systemId, system: s ? s.name : String(systemId), security: s ? s.security : null, hazards,
    groups: topGroups.map(([id, n]) => ({ id, name: names[id] || String(id), kills: n })),
    ships: [...shipCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ typeId: id, name: typeName(id), kills: n })),
    topPilots: [...pilotCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id),
    kills: kills.slice(0, 8).map(k => ({ id: k.id, time: k.time, victimShip: k.victimShip, victimShipName: k.victimShipName, where: k.loc.label, attackers: k.attackers, value: k.value, concord: k.concord }))
  };
}

/**
 * Check a route. path: [{ id, kills }] in order. hours: 1–3.
 * Systems with no kills in CCP's last-hour counts are skipped when hours is 1; otherwise every system is checked (up to 40).
 */
async function checkRoute(path, { hours = 1, grade = true, fetchKills = false } = {}) {
  const h = Math.max(1, Math.min(3, Number(hours) || 1));
  if (fetchKills) {
    const k = await safe(() => get('/universe/system_kills/'));
    const m = new Map(ok(k) ? k.map(x => [x.system_id, (x.ship_kills || 0) + (x.pod_kills || 0)]) : []);
    path = path.map(p => ({ ...p, kills: m.get(p.id) || 0 }));
  }
  const ids = path.map(p => p.id);
  const targets = path.map((p, i) => ({ ...p, i })).filter(p => h > 1 || p.kills > 0).slice(0, 40);
  const reports = [];
  for (const t of targets) {
    try {
      const r = await systemReport(t.id, h, ids[t.i - 1], ids[t.i + 1]);
      if (r.hazards.length) reports.push({ ...r, index: t.i });
    } catch (e) { reports.push({ systemId: t.id, system: sysName(t.id), index: t.i, error: e.message, hazards: [] }); if (/rate-limiting/.test(e.message)) break; }
  }
  if (grade) {
    const pi = require('./pilotintel');
    let n = 0;
    for (const r of reports.filter(x => x.hazards.some(z => z.severity !== 'info'))) {
      r.pilots = [];
      for (const id of r.topPilots || []) { if (n++ >= 6) break; try { r.pilots.push(await pi.quick(id)); } catch { /* skip */ } }
    }
  }
  const rank = { danger: 2, warn: 1, info: 0 };
  const worst = reports.flatMap(r => r.hazards).reduce((m, z) => Math.max(m, rank[z.severity]), -1);
  return { hours: h, checked: targets.length, reports, verdict: worst === 2 ? 'danger' : worst === 1 ? 'warn' : 'clear', at: new Date().toISOString() };
}

module.exports = { checkRoute, _systemReport: systemReport };
