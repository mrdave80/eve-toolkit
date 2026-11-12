'use strict';
/* System Intel: everything known about one system over the last 6, 12, 24 or 48 hours.
   Kills from zKillboard (with full killmails from ESI), who is active and in what, where the kills
   happen, an hourly timeline, your own intel channel reports, and the neighbourhood right now. */
const sde = require('./sde');
const { get, safe, ok, resolveNames } = require('./esi');
const { zk } = require('./zkill');

const HOURS = [6, 12, 24, 48];
const POD = new Set(['Capsule']);
const typeOf = id => (sde.type(id) || {});
const cache = new Map(); // `${id}:${hours}` -> { at, data }

async function gateLabel(locId, systemId) {
  if (!locId) return { kind: 'space', label: 'In space' };
  if (locId >= 50000000 && locId < 60000000) {
    const g = await safe(() => get(`/universe/stargates/${locId}/`));
    const dest = ok(g) && g.destination ? sde.system(g.destination.system_id) : null;
    return { kind: 'gate', id: locId, label: dest ? `${dest.name} gate` : 'A stargate' };
  }
  if ((locId >= 60000000 && locId < 64000000) || locId >= 1e12) return { kind: 'station', id: locId, label: 'A station or structure undock' };
  if (locId >= 40000000 && locId < 50000000) {
    for (const kind of ['asteroid_belts', 'moons', 'planets']) {
      const t = await safe(() => get(`/universe/${kind}/${locId}/`));
      if (ok(t) && t.name) return { kind: kind === 'asteroid_belts' ? 'belt' : 'celestial', id: locId, label: t.name };
    }
  }
  return { kind: 'space', id: locId, label: 'In space or a site' };
}

async function report(q, hoursIn, o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const id = typeof q === 'number' || /^\d+$/.test(String(q)) ? Number(q) : sde.systemIdByName(String(q || '').trim());
  const s = id ? sde.system(id) : null;
  if (!s) throw new Error(`Unknown system "${q}".`);
  const hours = HOURS.includes(Number(hoursIn)) ? Number(hoursIn) : 24;
  const key = `${id}:${hours}`;
  const hit = cache.get(key);
  if (hit && !o.refresh && Date.now() - hit.at < 120000) return hit.data;

  const since = Date.now() - hours * 3600000;
  const list = await zk(`/kills/solarSystemID/${id}/pastSeconds/${hours * 3600}/`, o.refresh ? 0 : 120000);
  const items = (Array.isArray(list) ? list : []);
  // Full killmails for the most recent (zKillboard only gives ids, value and location)
  const recent = items.slice(0, Math.min(items.length, o.max || 80));
  const mails = [];
  for (let i = 0; i < recent.length; i += 8) {
    const batch = await Promise.all(recent.slice(i, i + 8).map(k => safe(() => get(`/killmails/${k.killmail_id}/${k.zkb && k.zkb.hash}/`))));
    batch.forEach((km, j) => { if (ok(km) && Date.parse(km.killmail_time) >= since) mails.push({ km, zkb: recent[i + j].zkb || {} }); });
  }

  // Locations: gates and undocks with two or more kills are camps
  const locCache = new Map();
  const loc = async l => { if (!locCache.has(l)) locCache.set(l, await gateLabel(l, id)); return locCache.get(l); };
  const kills = [];
  const ids = new Set();
  for (const { km, zkb } of mails) {
    const v = km.victim || {};
    const players = (km.attackers || []).filter(a => a.character_id);
    const fb = (km.attackers || []).find(a => a.final_blow) || {};
    const where = await loc(zkb.locationID);
    [v.character_id, v.corporation_id, v.alliance_id, fb.corporation_id, fb.alliance_id].forEach(x => x && ids.add(x));
    players.forEach(a => { ids.add(a.character_id); ids.add(a.corporation_id); if (a.alliance_id) ids.add(a.alliance_id); });
    kills.push({ id: km.killmail_id, time: km.killmail_time, value: zkb.totalValue || 0, npc: !!zkb.npc, solo: !!zkb.solo, awox: !!zkb.awox,
      victim: { id: v.character_id || null, corp: v.corporation_id || null, alliance: v.alliance_id || null, ship: v.ship_type_id, shipName: typeOf(v.ship_type_id).name || '?', group: typeOf(v.ship_type_id).group || '' },
      attackers: players.map(a => ({ id: a.character_id, corp: a.corporation_id, alliance: a.alliance_id || null, ship: a.ship_type_id || null, shipName: a.ship_type_id ? typeOf(a.ship_type_id).name : null })),
      npcAttackers: (km.attackers || []).length - players.length,
      finalBlow: fb.character_id || null, where });
  }
  const names = ids.size ? await resolveNames([...ids].filter(Boolean)).catch(() => ({})) : {};
  const nm = x => (x ? names[x] || String(x) : null);
  const pvp = kills.filter(k => !k.npc && k.attackers.length);

  // Hourly timeline (oldest first)
  const now = Date.now();
  const timeline = Array.from({ length: hours }, (_, i) => ({ hourStart: new Date(now - (hours - i) * 3600000).toISOString(), kills: 0, pods: 0, value: 0 }));
  for (const k of pvp) { const i = Math.min(hours - 1, Math.max(0, hours - 1 - Math.floor((now - Date.parse(k.time)) / 3600000))); timeline[i].kills++; if (POD.has(k.victim.group)) timeline[i].pods++; timeline[i].value += k.value; }

  // Who is doing the killing (by alliance, else corp), who is dying, ships, pilots
  const tally = (arr, keyOf, extra) => { const m = new Map(); for (const x of arr) { const k = keyOf(x); if (!k) continue; const e = m.get(k) || { id: k, count: 0, last: null, ...extra }; e.count++; if (!e.last || x.time > e.last) e.last = x.time; m.set(k, e); } return [...m.values()].sort((a, b) => b.count - a.count); };
  const attackerGroups = new Map(), attackerShips = new Map(), attackerPilots = new Map();
  for (const k of pvp) {
    for (const g of new Set(k.attackers.map(a => a.alliance || a.corp))) { const e = attackerGroups.get(g) || { id: g, name: nm(g), kills: 0, last: null }; e.kills++; if (!e.last || k.time > e.last) e.last = k.time; attackerGroups.set(g, e); }
    for (const sh of new Set(k.attackers.map(a => a.ship).filter(Boolean))) { const e = attackerShips.get(sh) || { typeId: sh, name: typeOf(sh).name, group: typeOf(sh).group, kills: 0 }; e.kills++; attackerShips.set(sh, e); }
    for (const a of k.attackers) { const e = attackerPilots.get(a.id) || { id: a.id, name: nm(a.id), corp: nm(a.corp), alliance: nm(a.alliance), kills: 0, last: null, ships: new Set() }; e.kills++; if (a.shipName) e.ships.add(a.shipName); if (!e.last || k.time > e.last) e.last = k.time; attackerPilots.set(a.id, e); }
  }
  const victimGroups = tally(kills.filter(k => !k.npc || true), k => k.victim.alliance || k.victim.corp).map(e => ({ ...e, name: nm(e.id) }));
  const places = new Map();
  for (const k of pvp) { const key = k.where.label; const e = places.get(key) || { label: key, kind: k.where.kind, kills: 0, pods: 0, last: null }; e.kills++; if (POD.has(k.victim.group)) e.pods++; if (!e.last || k.time > e.last) e.last = k.time; places.set(key, e); }
  const placeList = [...places.values()].sort((a, b) => b.kills - a.kills);

  // Your intel channels: reports that named this system in the window
  let intelReports = [];
  try { intelReports = require('./intel').reports().filter(r => Date.parse(r.at) >= since && (r.systems || []).some(x => x.id === id)).slice(0, 40).map(r => ({ at: r.at, channel: r.channel, who: r.who, text: r.text, clear: r.clear })); } catch {}

  // Right now: CCP's last-hour numbers here and within two jumps, and sov
  let live = null, nearby = [], sov = null;
  try {
    const lm = require('./livemap');
    const st = await lm.liveStats(false);
    const k = st.kills.get(id) || { ship: 0, pod: 0, npc: 0 };
    live = { ship: k.ship, pod: k.pod, npc: k.npc, jumps: st.jumps.get(id) || 0, at: new Date(st.at).toISOString() };
    const sovId = st.sov.get(id); if (sovId) { const n = await resolveNames([sovId]).catch(() => ({})); sov = n[sovId] || null; }
    const seen = new Map([[id, 0]]), qq = [id];
    for (let i = 0; i < qq.length; i++) { const d = seen.get(qq[i]); if (d >= 2) continue; for (const g of sde.gates(qq[i])) if (!seen.has(g)) { seen.set(g, d + 1); qq.push(g); } }
    nearby = [...seen.entries()].filter(([x]) => x !== id).map(([x, d]) => { const ns = sde.system(x); const kk = st.kills.get(x) || { ship: 0, pod: 0, npc: 0 }; return { id: x, name: ns.name, security: ns.security, jumps: d, ship: kk.ship, pod: kk.pod, npc: kk.npc, traffic: st.jumps.get(x) || 0 }; })
      .sort((a, b) => (b.ship + b.pod) - (a.ship + a.pod) || a.jumps - b.jumps).slice(0, 12);
  } catch {}

  // Plain-language summary
  const camps = placeList.filter(p => (p.kind === 'gate' || p.kind === 'station') && p.kills >= 2);
  const lastKill = pvp[0] ? Math.round((now - Date.parse(pvp[0].time)) / 60000) : null;
  const notes = [];
  if (!pvp.length) notes.push({ tone: 'pos', text: `No player kills here in the last ${hours} hours.` });
  if (lastKill !== null) notes.push({ tone: lastKill <= 30 ? 'neg' : lastKill <= 120 ? 'gold' : '', text: `Last player kill ${lastKill < 60 ? lastKill + ' minutes' : Math.round(lastKill / 60) + ' hours'} ago.` });
  for (const c of camps.slice(0, 3)) notes.push({ tone: Date.now() - Date.parse(c.last) < 3600000 ? 'neg' : 'gold', text: `${c.kills} kills at the ${c.label}${c.pods >= 2 ? ', pods too' : ''}: looks like a ${c.kind === 'gate' ? 'gate' : 'undock'} camp (latest ${Math.round((now - Date.parse(c.last)) / 60000)} min ago).` });
  const topGroup = [...attackerGroups.values()].sort((a, b) => b.kills - a.kills)[0];
  if (topGroup && topGroup.kills >= 3) notes.push({ tone: '', text: `${topGroup.name} took part in ${topGroup.kills} of ${pvp.length} kills.` });
  const busiest = timeline.reduce((b, t, i) => (t.kills > (b ? timeline[b].kills : 0) ? i : b), null);
  if (busiest !== null && timeline[busiest].kills >= 3) notes.push({ tone: '', text: `Busiest hour: ${new Date(timeline[busiest].hourStart).toISOString().slice(11, 13)}:00 EVE with ${timeline[busiest].kills} kills.` });

  const data = {
    id, name: s.name, security: s.security, region: s.region, constellation: s.constellation, hours, sov, live, nearby, notes,
    totals: { kills: pvp.length, npcLosses: kills.length - pvp.length, pods: pvp.filter(k => POD.has(k.victim.group)).length, value: pvp.reduce((n, k) => n + k.value, 0), solo: pvp.filter(k => k.solo).length, listed: items.length, read: mails.length },
    timeline,
    attackerGroups: [...attackerGroups.values()].sort((a, b) => b.kills - a.kills).slice(0, 12),
    victimGroups: victimGroups.slice(0, 10),
    attackerShips: [...attackerShips.values()].sort((a, b) => b.kills - a.kills).slice(0, 12),
    pilots: [...attackerPilots.values()].sort((a, b) => b.kills - a.kills).slice(0, 15).map(p => ({ ...p, ships: [...p.ships].slice(0, 3) })),
    places: placeList.slice(0, 10),
    kills: kills.slice(0, 60).map(k => ({ ...k, victim: { ...k.victim, name: nm(k.victim.id), corpName: nm(k.victim.corp), allianceName: nm(k.victim.alliance) }, finalBlowName: nm(k.finalBlow),
      attackerGroups: [...new Set(k.attackers.map(a => nm(a.alliance || a.corp)))].slice(0, 3), attackerCount: k.attackers.length, attackers: k.attackers.slice(0, 12).map(a => ({ id: a.id, name: nm(a.id), shipName: a.shipName, ship: a.ship })) })),
    intel: intelReports,
    at: new Date().toISOString()
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

module.exports = { report, HOURS };
