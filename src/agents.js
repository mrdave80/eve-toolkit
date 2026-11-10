'use strict';
/* Agent finder and "where can I buy this with LP". Agent data comes from the game data download;
   LP store offers come from ESI and are cached for a day. */
const sde = require('./sde');
const { get, safe, ok, resolveNames } = require('./esi');
const { pool } = require('./market');

const TYPE_LABEL = { BasicAgent: 'Mission', ResearchAgent: 'Research', StorylineMissionAgent: 'Storyline', GenericStorylineMissionAgent: 'Storyline', EventMissionAgent: 'Event',
  FactionalWarfareAgent: 'Faction warfare', EpicArcAgent: 'Epic arc', CareerAgent: 'Career', TutorialAgent: 'Tutorial', CONCORDAgent: 'CONCORD', AuraAgent: 'Aura', HeraldryAgent: 'Heraldry' };

function data() {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const d = sde.agentData();
  if (!d) { const e = new Error('The agent finder needs a one-time game data refresh: Settings → Game data → Update.'); e.code = 'NO_AGENTS'; throw e; }
  return d;
}

function distances(from) {
  const dist = new Map([[from, 0]]), q = [from];
  for (let i = 0; i < q.length; i++) for (const v of sde.gates(q[i])) if (!dist.has(v)) { dist.set(v, dist.get(q[i]) + 1); q.push(v); }
  return dist;
}

/** Filter lists for the UI. */
function options() {
  const d = data();
  const used = (i) => [...new Set(d.agents.map(a => a[i]))];
  const factions = [...new Set(used(2).map(c => (d.npcCorps[c] || [])[1]).filter(Boolean))].map(id => ({ id, name: d.factions[id] || `Faction ${id}` })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    divisions: used(4).map(id => ({ id, name: d.divisions[id] || `Division ${id}` })).filter(x => x.name).sort((a, b) => a.name.localeCompare(b.name)),
    types: used(5).map(id => { const n = d.agentTypes[id] || ''; return { id, name: TYPE_LABEL[n] || n.replace(/Agent$/, '').replace(/([a-z])([A-Z])/g, '$1 $2') || `Type ${id}` }; }).sort((a, b) => a.name.localeCompare(b.name)),
    factions,
    corps: used(2).map(id => ({ id, name: (d.npcCorps[id] || [])[0] || `Corp ${id}`, faction: (d.npcCorps[id] || [])[1] || 0 })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

/** o: { from, jumps, levels:[1..5], division, type, faction, corp, highsec, locator, q } */
async function find(o = {}) {
  const d = data();
  const fromId = o.from ? sde.systemIdByName(String(o.from)) : null;
  if (o.from && !fromId) throw new Error(`Unknown system "${o.from}".`);
  const dist = fromId ? distances(fromId) : null;
  const maxJ = o.jumps ? Number(o.jumps) : null;
  const levels = new Set((o.levels || []).map(Number));
  const q = String(o.q || '').trim().toLowerCase();
  const rows = [];
  for (const [id, name, corp, level, div, type, loc, locator] of d.agents) {
    if (levels.size && !levels.has(level)) continue;
    if (o.division && Number(o.division) !== div) continue;
    if (o.type && Number(o.type) !== type) continue;
    if (o.corp && Number(o.corp) !== corp) continue;
    const c = d.npcCorps[corp] || ['', 0];
    if (o.faction && Number(o.faction) !== c[1]) continue;
    if (o.locator && !locator) continue;
    const st = d.stations[loc];
    const sysId = st ? st[0] : (loc >= 30000000 && loc < 33000000 ? loc : 0);
    const s = sysId ? sde.system(sysId) : null;
    if (o.highsec && (!s || Math.round(s.security * 10) / 10 < 0.5)) continue;
    const jumps = dist && sysId ? (dist.has(sysId) ? dist.get(sysId) : null) : null;
    if (dist && (jumps === null || (maxJ !== null && jumps > maxJ))) continue;
    if (q && !name.toLowerCase().includes(q) && !c[0].toLowerCase().includes(q) && !(s && s.name.toLowerCase().includes(q))) continue;
    const tn = d.agentTypes[type] || '';
    rows.push({ id, name, level, corpId: corp, corp: c[0], faction: d.factions[c[1]] || '', division: d.divisions[div] || '', type: TYPE_LABEL[tn] || tn.replace(/Agent$/, ''),
      locator: !!locator, stationId: st ? loc : null, systemId: sysId || null, system: s ? s.name : '', security: s ? s.security : null, region: s ? s.region : '', jumps });
  }
  rows.sort(dist ? (a, b) => a.jumps - b.jumps || b.level - a.level : (a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const shown = rows.slice(0, 200);
  const names = await resolveNames(shown.map(r => r.stationId).filter(Boolean)).catch(() => ({}));
  for (const r of shown) r.station = r.stationId ? names[r.stationId] || '' : '';
  // Mission hubs: stations with the most agents in the results
  const hubs = new Map();
  for (const r of rows) if (r.stationId) { const h = hubs.get(r.stationId) || { stationId: r.stationId, system: r.system, security: r.security, jumps: r.jumps, count: 0, levels: new Set() }; h.count++; h.levels.add(r.level); hubs.set(r.stationId, h); }
  const topHubs = [...hubs.values()].filter(h => h.count >= 3).sort((a, b) => b.count - a.count).slice(0, 8);
  const hn = await resolveNames(topHubs.map(h => h.stationId)).catch(() => ({}));
  return { from: fromId ? sde.system(fromId).name : null, total: rows.length, rows: shown,
    hubs: topHubs.map(h => ({ ...h, levels: [...h.levels].sort(), station: hn[h.stationId] || '' })) };
}

// ---------- Where can I buy this with LP ----------
const offerCache = new Map(); // corpId -> { at, offers }
async function offers(corpId) {
  const hit = offerCache.get(corpId);
  if (hit && Date.now() - hit.at < 86400000) return hit.offers;
  const r = await safe(() => get(`/loyalty/stores/${corpId}/offers/`));
  const list = ok(r) && Array.isArray(r) ? r : [];
  offerCache.set(corpId, { at: Date.now(), offers: list });
  return list;
}

/** Every NPC corp whose LP store sells this item, nearest station first. */
async function lpFor(item, from) {
  const d = data();
  const typeId = typeof item === 'number' ? item : sde.typeIdByName(String(item || ''));
  if (!typeId) throw new Error(`Unknown item "${item}".`);
  const fromId = from ? sde.systemIdByName(String(from)) : null;
  const dist = fromId ? distances(fromId) : null;
  const corps = [...new Set(d.agents.map(a => a[2]))];
  const hits = [];
  await pool(corps, 8, async c => {
    const list = await offers(c);
    for (const o of list) if (o.type_id === typeId) hits.push({ corpId: c, corp: (d.npcCorps[c] || [])[0] || String(c), lp: o.lp_cost, isk: o.isk_cost, qty: o.quantity, required: (o.required_items || []).map(x => ({ typeId: x.type_id, name: (sde.type(x.type_id) || {}).name, qty: x.quantity })) });
  });
  // nearest station of each corp
  for (const h of hits) {
    let best = null;
    for (const [sid, [sys, owner]] of Object.entries(d.stations)) {
      if (owner !== h.corpId) continue;
      const j = dist ? (dist.has(sys) ? dist.get(sys) : null) : 0;
      if (dist && j === null) continue;
      if (!best || j < best.jumps) best = { stationId: Number(sid), systemId: sys, jumps: j };
    }
    if (best) { const s = sde.system(best.systemId); Object.assign(h, { stationId: best.stationId, system: s ? s.name : '', security: s ? s.security : null, jumps: dist ? best.jumps : null }); }
  }
  hits.sort((a, b) => (a.jumps ?? 999) - (b.jumps ?? 999) || a.lp - b.lp);
  const names = await resolveNames(hits.map(h => h.stationId).filter(Boolean)).catch(() => ({}));
  for (const h of hits) h.station = h.stationId ? names[h.stationId] || '' : '';
  return { typeId, name: (sde.type(typeId) || {}).name, from: fromId ? sde.system(fromId).name : null, rows: hits, checked: corps.length };
}

module.exports = { options, find, lpFor };
