'use strict';
/* Wars that concern you: CCP lists war ids, newest first (2000 a page). Each war's details are read once
   and kept: finished wars never change, and wars between other people are only looked at again when
   they're new. Wars involving a pilot's corporation or alliance (as aggressor, defender or ally) are
   listed with which pilots they affect. */
const store = require('./store');
const { get, safe, ok, resolveNames } = require('./esi');

function cache() { const d = store.get(); d.warCache = d.warCache || { checked: [], ours: {}, at: 0 }; return d.warCache; }

async function ourEntities() {
  const chars = (store.get().characters || []);
  const out = new Map(); // entity id -> [pilot names]
  await Promise.all(chars.map(async c => {
    const p = await safe(() => get(`/characters/${c.id}/`));
    if (!ok(p)) return;
    for (const e of [p.corporation_id, p.alliance_id].filter(Boolean)) { if (!out.has(e)) out.set(e, []); out.get(e).push(c.name); }
  }));
  return out;
}
const sideOf = (w, ids) => {
  const a = w.aggressor || {}, d = w.defender || {};
  const hit = x => ids.has(x.corporation_id) || ids.has(x.alliance_id);
  if (hit(a)) return { side: 'aggressor', entity: a.alliance_id && ids.has(a.alliance_id) ? a.alliance_id : a.corporation_id };
  if (hit(d)) return { side: 'defender', entity: d.alliance_id && ids.has(d.alliance_id) ? d.alliance_id : d.corporation_id };
  const al = (w.allies || []).find(hit);
  if (al) return { side: 'ally', entity: al.alliance_id && ids.has(al.alliance_id) ? al.alliance_id : al.corporation_id };
  return null;
};

/** Refresh (at most every 30 minutes unless forced) and return the wars that concern you. */
async function list(o = {}) {
  const c = cache();
  const ents = await ourEntities();
  const ids = new Set(ents.keys());
  if (o.refresh || Date.now() - c.at > 30 * 60000) {
    const r = await safe(() => get('/wars/'));
    if (ok(r)) {
      const checked = new Set(c.checked);
      const todo = r.filter(id => !checked.has(id));
      for (let i = 0; i < todo.length; i += 20) {
        const batch = await Promise.all(todo.slice(i, i + 20).map(id => safe(() => get(`/wars/${id}/`)).then(w => [id, w])));
        for (const [id, w] of batch) {
          if (!ok(w)) continue;
          checked.add(id);
          if (sideOf(w, ids)) c.ours[id] = w;
        }
        if (o.onProgress) o.onProgress(Math.min(todo.length, i + 20), todo.length);
      }
      // wars we're in that are still going: re-read for allies and end dates
      for (const id of Object.keys(c.ours)) { const w = c.ours[id]; if (!w.finished || Date.parse(w.finished) > Date.now()) { const n = await safe(() => get(`/wars/${id}/`)); if (ok(n)) c.ours[id] = n; } }
      c.checked = [...checked].sort((a, b) => b - a).slice(0, 6000);
      c.at = Date.now();
      store.save('warCache');
    }
  }
  const now = Date.now();
  const rows = Object.entries(c.ours).map(([id, w]) => ({ id: Number(id), w, s: sideOf(w, ids) })).filter(x => x.s);
  const nameIds = new Set();
  for (const { w } of rows) { for (const x of [w.aggressor, w.defender, ...(w.allies || [])]) if (x) nameIds.add(x.alliance_id || x.corporation_id); }
  const names = nameIds.size ? await resolveNames([...nameIds]).catch(() => ({})) : {};
  const nm = x => (x ? names[x.alliance_id || x.corporation_id] || String(x.alliance_id || x.corporation_id) : '');
  const out = rows.map(({ id, w, s }) => {
    const active = !w.finished || Date.parse(w.finished) > now;
    const started = w.started ? Date.parse(w.started) : null;
    return { id, aggressor: nm(w.aggressor), defender: nm(w.defender), allies: (w.allies || []).map(nm), side: s.side, entity: names[s.entity] || String(s.entity), pilots: ents.get(s.entity) || [],
      declared: w.declared, started: w.started, finished: w.finished || null, mutual: !!w.mutual, openForAllies: !!w.open_for_allies,
      active, hot: active && started !== null && started <= now, startsIn: started && started > now ? started - now : 0,
      kills: { aggressor: (w.aggressor || {}).ships_killed || 0, defender: (w.defender || {}).ships_killed || 0, aggressorIsk: (w.aggressor || {}).isk_destroyed || 0, defenderIsk: (w.defender || {}).isk_destroyed || 0 } };
  }).sort((a, b) => (b.active - a.active) || String(b.declared).localeCompare(String(a.declared)));
  return { wars: out, checkedAt: c.at ? new Date(c.at).toISOString() : null, entities: [...ents.entries()].map(([id, p]) => ({ id, name: names[id] || null, pilots: p })) };
}

module.exports = { list, _sideOf: sideOf };
