'use strict';
/* Hunting grounds (active ratters, little PvP) and safe ratting spots (quiet, no recent kills) near a system. */
const sde = require('./sde');
const { resolveNames } = require('./esi');
const { liveStats } = require('./livemap');
const bridges = require('./bridges');
const { zk } = require('./zkill');

const zoneOf = id => {
  const s = sde.system(id); if (!s) return null;
  const c = Number(s.whClass) || 0;
  if ((c >= 1 && c <= 6) || c >= 12) return 'wh';
  const sec = Math.round(s.security * 10) / 10;
  return sec >= 0.5 ? 'hs' : sec > 0 ? 'ls' : 'ns';
};

function within(from, maxJumps, useBridges) {
  const extra = new Map();
  if (useBridges) for (const b of bridges.list()) { (extra.get(b.a) || extra.set(b.a, []).get(b.a)).push(b.b); (extra.get(b.b) || extra.set(b.b, []).get(b.b)).push(b.a); }
  const dist = new Map([[from, 0]]), q = [from];
  for (let i = 0; i < q.length; i++) {
    const u = q[i]; if (dist.get(u) >= maxJumps) continue;
    for (const v of [...sde.gates(u), ...(extra.get(u) || [])]) if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); q.push(v); }
  }
  return dist;
}

/**
 * opts: { from, jumps (1-15), mode: 'hunt' | 'rat', zones: ['ls','ns'], bridges }
 */
async function find(opts = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const from = typeof opts.from === 'number' ? opts.from : sde.systemIdByName(String(opts.from || ''));
  if (!from) throw new Error(`Unknown system "${opts.from}".`);
  const maxJ = Math.max(1, Math.min(15, Number(opts.jumps) || 6));
  const zones = new Set((opts.zones && opts.zones.length ? opts.zones : ['ls', 'ns']));
  const mode = opts.mode === 'rat' ? 'rat' : 'hunt';
  const st = await liveStats(false);
  const dist = within(from, maxJ, !!opts.bridges);
  const rows = [];
  for (const [id, j] of dist) {
    const z = zoneOf(id); if (!z || !zones.has(z)) continue;
    const s = sde.system(id);
    const k = st.kills.get(id) || { ship: 0, pod: 0, npc: 0 };
    const traffic = st.jumps.get(id) || 0;
    const gates = sde.gates(id).length;
    let score = 0; const why = [];
    if (mode === 'hunt') {
      if (!k.npc) continue;
      score = k.npc / (1 + k.ship * 2 + k.pod) / (1 + j * 0.12) * (traffic <= 15 ? 1.15 : 1);
      why.push(`${k.npc} NPCs killed in the last hour`);
      why.push(k.ship || k.pod ? `${k.ship} ships and ${k.pod} pods died there too: someone may already be hunting` : 'no PvP kills in the last hour');
      if (gates === 1) why.push('dead end: one way in, one way out');
      if (traffic <= 5) why.push(`${traffic} jumps through it in the last hour`);
    } else {
      if (k.ship || k.pod) continue;
      score = (1 / (1 + traffic / 8)) * (gates === 1 ? 1.4 : gates === 2 ? 1.15 : 1) * (k.npc > 150 ? 0.7 : 1) / (1 + j * 0.08);
      why.push('no ships or pods killed in the last hour');
      why.push(`${traffic} jump${traffic === 1 ? '' : 's'} through it in the last hour`);
      if (gates === 1) why.push('dead end: hostiles have to come in through one gate');
      if (k.npc > 150) why.push(`busy with other ratters (${k.npc} NPCs killed)`);
    }
    rows.push({ id, name: s.name, security: s.security, region: s.region, regionId: s.regionId, zone: z, jumps: j, npc: k.npc, ship: k.ship, pod: k.pod, traffic, gates, sov: st.sov.get(id) || null, score, why });
  }
  rows.sort((a, b) => b.score - a.score);
  const top = rows.slice(0, 60);
  const best = top[0] ? top[0].score : 1;
  for (const r of top) r.pct = Math.round(100 * r.score / best);
  const sovIds = [...new Set(top.map(r => r.sov).filter(Boolean))];
  const names = sovIds.length ? await resolveNames(sovIds).catch(() => ({})) : {};
  for (const r of top) r.sovName = r.sov ? names[r.sov] || null : null;
  return { from: sde.system(from).name, mode, jumps: maxJ, checked: dist.size, rows: top, updated: new Date(st.at).toISOString() };
}

/** zKillboard check of the last few hours for one system: catches camps and roams the hourly stats miss. */
async function deepCheck(systemId, hours = 3) {
  const list = await zk(`/kills/solarSystemID/${Number(systemId)}/pastSeconds/${Math.max(1, Math.min(24, hours)) * 3600}/`, 120000);
  const items = Array.isArray(list) ? list : [];
  const pvp = items.filter(k => k.zkb && !k.zkb.npc);
  return { systemId: Number(systemId), hours, kills: pvp.length, npcLosses: items.length - pvp.length, value: pvp.reduce((n, k) => n + (k.zkb.totalValue || 0), 0) };
}

module.exports = { find, deepCheck, within };
