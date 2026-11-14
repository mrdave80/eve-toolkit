'use strict';
/* What to train next, from CCP's own certificates and ship masteries.
   - forShip: mastery I–V for one ship, per pilot: what's missing and how long it takes
   - suggestions: for one pilot, the certificates closest to their next level (the quick wins),
     grouped by what they're for */
const sde = require('./sde');
const store = require('./store');
const skillplan = require('./skillplan');

const reqList = map => [...map].map(([id, level]) => ({ id, level, name: (sde.type(id) || {}).name }));

async function forShip(q, charIds) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  if (!sde.hasCerts()) throw new Error('This needs a game data update for certificates and masteries: Settings → Game data → Update.');
  const id = Number(q) || sde.typeIdByName(String(q || '').trim());
  const t = id ? sde.type(id) : null;
  if (!t || t.categoryId !== 6) throw new Error(`"${q}" isn't a ship.`);
  const levels = sde.masteryFor(id);
  if (!levels) throw new Error(`CCP has no masteries for the ${t.name}.`);
  const ids = (charIds && charIds.length ? charIds : store.get().characters.filter(c => !c.needsReauth).map(c => c.id)).map(Number);
  const base = new Map(sde.allRequirements(id));
  const pilots = [];
  for (const cid of ids) {
    let st; try { st = await skillplan.charState(cid); } catch (e) { pilots.push({ id: cid, error: e.message }); continue; }
    const check = map => skillplan.checkAgainst(cid, null, reqList(map), st.levels, st.attributes, st.factor, st.sp);
    const fly = check(base);
    let total = new Map(base);
    const out = levels.map(l => { for (const [k, v] of l.req) total.set(k, Math.max(total.get(k) || 0, v)); const c = check(new Map(total)); return { level: l.level, done: c.canFly, minutes: c.minutes, missing: c.missing.map(m => ({ id: m.id, name: m.name, level: m.level, have: m.have })) }; });
    const reached = out.filter(x => x.done).length;
    pilots.push({ id: cid, name: fly.name, canFly: fly.canFly, flyMinutes: fly.minutes, flyMissing: fly.missing.map(m => ({ id: m.id, name: m.name, level: m.level, have: m.have })), mastery: reached, levels: out });
  }
  return { shipTypeId: id, ship: t.name, group: t.group, levels: levels.map(l => ({ level: l.level, certs: l.certs })), pilots };
}

async function suggestions(charId, o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  if (!sde.hasCerts()) throw new Error('This needs a game data update for certificates and masteries: Settings → Game data → Update.');
  const st = await skillplan.charState(Number(charId));
  const out = [];
  for (const c of sde.certificates()) {
    let lvl = 0;
    for (let i = 0; i < 5; i++) { const ok = [...c.levels[i]].every(([sk, l]) => (st.levels.get(sk) || 0) >= l); if (ok && c.levels[i].size) lvl = i + 1; else break; }
    if (lvl >= 5) { out.push({ id: c.id, name: c.name, group: c.group, level: 5, next: null }); continue; }
    const want = new Map(c.levels[lvl]);
    if (!want.size) continue;
    const chk = skillplan.checkAgainst(Number(charId), null, reqList(want), st.levels, st.attributes, st.factor, st.sp);
    out.push({ id: c.id, name: c.name, group: c.group, level: lvl, next: { level: lvl + 1, minutes: chk.minutes, missing: chk.missing.map(m => ({ id: m.id, name: m.name, level: m.level, have: m.have })) } });
  }
  const quick = out.filter(x => x.next && x.next.minutes > 0).sort((a, b) => a.next.minutes - b.next.minutes).slice(0, o.limit || 15);
  return { charId: Number(charId), certificates: out.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)), quick };
}

module.exports = { forShip, suggestions };
