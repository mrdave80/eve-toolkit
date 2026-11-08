'use strict';
/* Wormhole residents: who lives in a J-system, judged from zKillboard stats and recent killmails. */
const sde = require('./sde');
const whinfo = require('./whinfo');
const { get, safe, ok, resolveNames } = require('./esi');
const { zk } = require('./zkill');

const STRUCTURE_GROUPS = new Set(['Citadel', 'Engineering Complex', 'Refinery', 'Control Tower', 'Upwell Jump Gate', 'Upwell Cyno Beacon', 'Upwell Cyno Jammer']);
const groupOf = id => (sde.ready() && sde.type(id)) ? sde.type(id).group : null;
const nameOf = id => (sde.ready() && sde.type(id)) ? sde.type(id).name : null;
const DAY = 86400000;

function tzOf(hours) {
  // hours: array of 24 counts (EVE time = UTC)
  const bands = { 'EU (17–23 ET)': [17, 18, 19, 20, 21, 22, 23], 'US (00–06 ET)': [0, 1, 2, 3, 4, 5, 6], 'AU / Asia (07–14 ET)': [7, 8, 9, 10, 11, 12, 13, 14] };
  const total = hours.reduce((a, b) => a + b, 0) || 1;
  return Object.entries(bands).map(([k, hs]) => ({ tz: k, pct: Math.round(100 * hs.reduce((n, h) => n + hours[h], 0) / total) })).sort((a, b) => b.pct - a.pct);
}

async function check(q) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const id = typeof q === 'number' ? q : sde.systemIdByName(String(q || '').trim());
  if (!id) throw new Error(`Unknown system "${q}".`);
  const sys = sde.system(id);
  const c = Number(sys.whClass) || 0;
  const isWh = (c >= 1 && c <= 6) || c >= 12;
  const [stats, list] = await Promise.all([zk(`/stats/solarSystemID/${id}/`, 600000).catch(() => null), zk(`/kills/solarSystemID/${id}/`, 300000).catch(() => [])]);
  const items = (Array.isArray(list) ? list : []).slice(0, 50);
  const kms = [];
  for (let i = 0; i < items.length; i += 8) {
    const b = await Promise.all(items.slice(i, i + 8).map(k => safe(() => get(`/killmails/${k.killmail_id}/${k.zkb && k.zkb.hash}/`))));
    b.forEach((km, j) => { if (ok(km)) kms.push({ km, value: (items[i + j].zkb || {}).totalValue || 0 }); });
  }
  // Score each group (alliance, or corp when not in one)
  const groups = new Map();
  const g = (id2, isAlliance) => { const key = (isAlliance ? 'a' : 'c') + id2; if (!groups.has(key)) groups.set(key, { id: id2, alliance: isAlliance, attacks: 0, losses: 0, structures: [], days: new Set(), last: 0, first: Infinity, hours: Array(24).fill(0), pilots: new Set() }); return groups.get(key); };
  const hours = Array(24).fill(0);
  let lastKill = 0;
  for (const { km, value } of kms) {
    const t = Date.parse(km.killmail_time); const day = km.killmail_time.slice(0, 10); const hr = new Date(t).getUTCHours();
    hours[hr]++; lastKill = Math.max(lastKill, t);
    const v = km.victim || {};
    if (v.corporation_id) {
      const x = g(v.alliance_id || v.corporation_id, !!v.alliance_id);
      x.losses++; x.days.add(day); x.last = Math.max(x.last, t); x.first = Math.min(x.first, t); x.hours[hr]++;
      if (v.character_id) x.pilots.add(v.character_id);
      if (STRUCTURE_GROUPS.has(groupOf(v.ship_type_id))) x.structures.push({ type: nameOf(v.ship_type_id), time: km.killmail_time, value, id: km.killmail_id });
    }
    const seen = new Set();
    for (const a of km.attackers || []) {
      if (!a.corporation_id || a.corporation_id < 2000000) continue; // skip NPCs
      const key = a.alliance_id || a.corporation_id; if (seen.has(key)) continue; seen.add(key);
      const x = g(key, !!a.alliance_id);
      x.attacks++; x.days.add(day); x.last = Math.max(x.last, t); x.first = Math.min(x.first, t); x.hours[hr]++;
      if (a.character_id) x.pilots.add(a.character_id);
    }
  }
  const now = Date.now();
  let list2 = [...groups.values()].map(x => {
    const daysActive = x.days.size;
    const recency = Math.max(0, 1 - (now - x.last) / (45 * DAY));
    const score = (daysActive * 3 + x.attacks + x.losses * 1.5 + x.structures.length * 10) * (0.4 + 0.6 * recency);
    let role = 'Visitor';
    if (x.structures.length && x.last <= Math.max(...x.structures.map(s => Date.parse(s.time))) + DAY) role = 'Possibly evicted';
    else if (daysActive >= 3 && x.attacks >= 2) role = x.losses > 0 || x.structures.length ? 'Likely resident' : 'Regular hunter';
    else if (daysActive >= 3 && x.losses >= 3) role = 'Dies here often';
    else if (x.attacks >= 3 && daysActive <= 2) role = 'Eviction or roam';
    return { id: x.id, alliance: x.alliance, attacks: x.attacks, losses: x.losses, structures: x.structures, daysActive, last: new Date(x.last).toISOString(), first: new Date(x.first).toISOString(), pilots: x.pilots.size, tz: tzOf(x.hours)[0], score, role };
  }).sort((a, b) => b.score - a.score).slice(0, 8);
  // zKill all-time top groups fill in when recent mails are thin
  const top = s => (stats && stats.topAllTime ? ((stats.topAllTime.find(t => t.type === s) || {}).data || []) : []);
  const allTime = [...top('alliance').slice(0, 5).map(x => ({ id: x.allianceID, alliance: true, kills: x.kills })), ...top('corporation').slice(0, 5).map(x => ({ id: x.corporationID, alliance: false, kills: x.kills }))].filter(x => x.id);
  const names = await resolveNames([...new Set([...list2.map(x => x.id), ...allTime.map(x => x.id)])]).catch(() => ({}));
  list2 = list2.map(x => ({ ...x, name: names[x.id] || String(x.id) }));
  // Overall activity hours: prefer zKill's long-term heatmap
  let heat = hours;
  if (stats && stats.activity) { heat = Array(24).fill(0); for (let d = 0; d < 7; d++) { const row = stats.activity[d] || stats.activity[String(d)]; if (row) for (let h = 0; h < 24; h++) heat[h] += Number(row[h] || row[String(h)] || 0); } }
  const quietDays = lastKill ? Math.floor((now - lastKill) / DAY) : null;
  const residents = list2.filter(x => x.role === 'Likely resident');
  const verdict = !kms.length ? 'No kills on record. The hole may be empty, or the residents never fight here.'
    : quietDays > 30 ? `No kills for ${quietDays} days. Possibly abandoned.`
    : residents.length ? `Looks occupied by ${residents.slice(0, 2).map(r => r.name).join(' and ')}.`
    : list2[0] ? `No clear resident. Most active: ${list2[0].name} (${list2[0].role.toLowerCase()}).` : 'Not enough data.';
  return {
    id, name: sys.name, isWh, whClass: c, region: sys.region, verdict, info: isWh ? whinfo.info(id) : null, quietDays, lastKill: lastKill ? new Date(lastKill).toISOString() : null, mailsChecked: kms.length,
    kills30: kms.filter(k => now - Date.parse(k.km.killmail_time) < 30 * DAY).length,
    groups: list2, allTime: allTime.map(x => ({ ...x, name: names[x.id] || String(x.id) })), heat, tz: tzOf(heat),
    structureLosses: list2.flatMap(x => x.structures.map(s => ({ ...s, owner: x.name }))).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 8),
    statsTotal: stats ? { kills: stats.shipsDestroyed || 0, isk: stats.iskDestroyed || 0 } : null
  };
}

module.exports = { check, tzOf };
