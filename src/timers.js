'use strict';
/* Timer alerts: jump clone ready, jump fatigue cleared, and incursions spawning near your pilots.
   ESI is read in the regular background check; a one-minute tick fires alerts on time. */
const store = require('./store');
const extra = require('./esi-extra');
const esi = require('./esi');
const sde = require('./sde');

const timers = () => { const d = store.get(); d.timers = d.timers || {}; return d.timers; };
const alertOn = key => ((store.get().settings.alerts || {})[key] !== false);

/** Called per pilot from the background check. Remembers clone and fatigue times that are still ahead. */
async function refreshPilot(c) {
  if (!alertOn('cloneJump') && !alertOn('fatigue')) return;
  const f = await extra.fatigue(c.id);
  const t = timers(); const now = Date.now();
  const cur = t[c.id] || {};
  const next = { name: c.name };
  const fresh = {
    clone: f.nextCloneJump && Date.parse(f.nextCloneJump) > now ? f.nextCloneJump : null,
    fatigue: f.fatigueExpires && Date.parse(f.fatigueExpires) > now ? f.fatigueExpires : null
  };
  for (const k of ['clone', 'fatigue']) {
    if (fresh[k]) { next[k] = fresh[k]; next[k + 'Sent'] = cur[k] === fresh[k] ? !!cur[k + 'Sent'] : false; }
    else if (cur[k] && !cur[k + 'Sent']) { next[k] = cur[k]; next[k + 'Sent'] = false; }   // ran out between checks: let the tick fire it
  }
  t[c.id] = next;
  store.save('timers');
}

/** Every minute: fire any timer that has run out. */
function tick(notify) {
  if (!store.get().settings.notifications) return;
  const t = timers(); const now = Date.now(); let changed = false;
  for (const [id, x] of Object.entries(t)) {
    if (!(store.get().characters || []).some(c => String(c.id) === id)) { delete t[id]; changed = true; continue; }
    if (x.clone && !x.cloneSent && Date.parse(x.clone) <= now) { x.cloneSent = true; changed = true; if (alertOn('cloneJump')) notify(x.name, 'Jump clone is ready.', 'timers'); }
    if (x.fatigue && !x.fatigueSent && Date.parse(x.fatigue) <= now) { x.fatigueSent = true; changed = true; if (alertOn('fatigue')) notify(x.name, 'Jump fatigue has cleared.', 'timers'); }
  }
  if (changed) store.save('timers');
}

function near(from, maxJumps) {
  const dist = new Map([[from, 0]]), q = [from];
  for (let i = 0; i < q.length; i++) {
    const u = q[i]; if (dist.get(u) >= maxJumps) continue;
    for (const v of sde.gates(u)) if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); q.push(v); }
  }
  return dist;
}

/** Once per background check: alert on incursions within N jumps of any pilot. */
async function checkIncursions(overviews, notify, seen) {
  const d = store.get();
  if (!d.settings.notifications || !alertOn('incursions') || !sde.ready()) return;
  const maxJ = Math.max(1, Math.min(30, Number(d.settings.incursionJumps) || 10));
  const pilots = overviews.filter(o => o && o.systemId);
  if (!pilots.length) return;
  const list = await esi.get('/incursions/').catch(() => null);
  if (!list) return;
  const maps = pilots.map(o => ({ o, dist: near(o.systemId, maxJ) }));
  for (const inc of list) {
    let best = null;
    for (const { o, dist } of maps) for (const s of [inc.staging_solar_system_id, ...(inc.infested_solar_systems || [])]) {
      const j = dist.get(s); if (j !== undefined && (!best || j < best.j)) best = { j, o, s };
    }
    if (!best) continue;
    if (seen(d, `inc:${inc.constellation_id}:${inc.staging_solar_system_id}`)) continue;
    const staging = sde.system(inc.staging_solar_system_id);
    const sys = sde.system(best.s);
    notify('Incursion nearby', `${best.j === 0 ? 'In' : best.j + ' jump' + (best.j === 1 ? '' : 's') + ' from'} ${best.o.name} (${best.o.system}). ${sys ? sys.name : ''}${staging ? `, staging ${staging.name} (${staging.region})` : ''}. ${inc.has_boss ? 'Mothership is up.' : ''}`.trim(), 'timers');
  }
}

module.exports = { refreshPilot, tick, checkIncursions };
