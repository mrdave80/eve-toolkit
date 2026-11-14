// Skill plans, "can I fly" checks and remap optimisation (needs SDE).
const crypto = require('crypto');
const store = require('./store');
const sde = require('./sde');
const { get, safe, ok } = require('./esi');

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
const spFor = (rank, lvl) => lvl <= 0 ? 0 : Math.ceil(250 * rank * Math.pow(Math.sqrt(32), lvl - 1));
const ATTRS = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'];

// ---------- Character state ----------

async function charState(charId) {
  const [skills, attrs, queue] = await Promise.all([
    get(`/characters/${charId}/skills/`, charId),
    safe(() => get(`/characters/${charId}/attributes/`, charId)),
    safe(() => get(`/characters/${charId}/skillqueue/`, charId))
  ]);
  const levels = new Map(), sp = new Map();
  for (const k of skills.skills) { levels.set(k.skill_id, k.trained_skill_level); sp.set(k.skill_id, k.skillpoints_in_skill); }
  // Queued levels count as "will have" for planning
  const queued = new Map();
  if (ok(queue)) for (const q of queue) queued.set(q.skill_id, Math.max(queued.get(q.skill_id) || 0, q.finished_level));
  const a = ok(attrs) ? attrs : { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 };
  // Calibrate against the live training rate (captures implants and boosters)
  let factor = 1;
  if (ok(queue)) {
    const cur = queue.find(q => q.start_date && q.finish_date && Date.parse(q.finish_date) > Date.now() && Date.parse(q.start_date) <= Date.now());
    if (cur && sde.ready()) {
      const m = sde.skillMeta(cur.skill_id);
      const formula = a[m.primary] + a[m.secondary] / 2;
      const live = (cur.level_end_sp - cur.training_start_sp) / ((Date.parse(cur.finish_date) - Date.parse(cur.start_date)) / 60000);
      if (formula > 0 && live > 0) factor = Math.max(0.8, Math.min(1.8, live / formula));
    }
  }
  return { levels, sp, queued, attributes: a, factor, bonusRemaps: a.bonus_remaps || 0, nextRemap: a.accrued_remap_cooldown_date || null };
}

// ---------- Plans ----------

function plans(charId) { return (store.get().skillPlans || []).filter(p => !charId || p.charId === charId); }
function savePlan(plan) {
  const d = store.get();
  d.skillPlans = d.skillPlans || [];
  if (!plan.id) plan.id = crypto.randomBytes(6).toString('hex');
  plan.updatedAt = new Date().toISOString();
  const i = d.skillPlans.findIndex(p => p.id === plan.id);
  if (i === -1) d.skillPlans.push(plan); else d.skillPlans[i] = plan;
  store.save();
  return plan;
}
function deletePlan(id) { const d = store.get(); d.skillPlans = (d.skillPlans || []).filter(p => p.id !== id); store.save(); return true; }

/** Insert skill@level (and every prerequisite and lower level) into an entry list, keeping order valid. */
function addToEntries(entries, skillId, level, have) {
  const inPlan = (id, l) => entries.some(e => e.skillId === id && e.level >= l);
  const add = (id, l) => {
    for (const r of sde.requirements(id)) add(r.id, r.level);
    for (let x = 1; x <= l; x++) {
      if ((have.get(id) || 0) >= x || inPlan(id, x)) continue;
      entries.push({ skillId: id, level: x });
    }
  };
  add(skillId, level);
  return entries;
}

function addTypeRequirements(entries, typeId, have) {
  for (const [id, lvl] of sde.allRequirements(typeId)) addToEntries(entries, id, lvl, have);
  return entries;
}

function parseText(text) {
  const out = [], unknown = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.+?)\s+(I|II|III|IV|V|[1-5])$/i.exec(line);
    if (!m) { unknown.push(line); continue; }
    const id = sde.typeIdByName(m[1]);
    const level = ROMAN[m[2].toUpperCase()] || Number(m[2]);
    if (!id) unknown.push(line); else out.push({ skillId: id, level });
  }
  return { entries: out, unknown };
}

function exportText(entries) {
  return entries.map(e => `${(sde.type(e.skillId) || {}).name || e.skillId} ${e.level}`).join('\n');
}

function timeFor(entry, attrs, factor, spNow) {
  const m = sde.skillMeta(entry.skillId);
  const need = spFor(m.rank, entry.level), prev = spFor(m.rank, entry.level - 1);
  const start = Math.max(prev, Math.min(need, spNow || 0));
  const rate = (attrs[m.primary] + attrs[m.secondary] / 2) * factor; // SP per minute
  return { sp: need - start, minutes: (need - start) / rate, rank: m.rank, primary: m.primary, secondary: m.secondary };
}

async function compute(plan) {
  const st = await charState(plan.charId);
  let total = 0, totalSp = 0;
  const seen = new Map(st.levels);
  const rows = plan.entries.map((e, i) => {
    const t = sde.type(e.skillId) || { name: `Skill ${e.skillId}` };
    const trained = (st.levels.get(e.skillId) || 0) >= e.level;
    const queued = !trained && (st.queued.get(e.skillId) || 0) >= e.level;
    const prereqOk = sde.requirements(e.skillId).every(r => (seen.get(r.id) || 0) >= r.level);
    const tm = timeFor(e, st.attributes, st.factor, (st.levels.get(e.skillId) || 0) === e.level - 1 ? st.sp.get(e.skillId) : 0);
    if (!trained) { total += tm.minutes; totalSp += tm.sp; }
    seen.set(e.skillId, Math.max(seen.get(e.skillId) || 0, e.level));
    return { index: i, skillId: e.skillId, name: t.name, group: t.group, level: e.level, trained, queued, prereqOk, ...tm, cumulative: total, note: e.note || '' };
  });
  return { plan, rows, totalMinutes: total, totalSp, attributes: st.attributes, factor: st.factor, bonusRemaps: st.bonusRemaps, nextRemap: st.nextRemap };
}

/** Best remap for the untrained part of a plan. Remaps: 17 base, 14 points to spread, max +10 each. */
async function optimiseRemap(plan) {
  const st = await charState(plan.charId);
  const todo = plan.entries.filter(e => (st.levels.get(e.skillId) || 0) < e.level).map(e => {
    const m = sde.skillMeta(e.skillId);
    const need = spFor(m.rank, e.level) - spFor(m.rank, e.level - 1);
    return { sp: need, p: m.primary, s: m.secondary };
  });
  if (!todo.length) return null;
  // Group SP by (primary, secondary) pair to make evaluation fast
  const pairs = new Map();
  for (const t of todo) { const k = t.p + '|' + t.s; pairs.set(k, (pairs.get(k) || 0) + t.sp); }
  const pairList = [...pairs.entries()].map(([k, sp]) => { const [p, s] = k.split('|'); return { p, s, sp }; });
  const evalAttrs = a => pairList.reduce((n, x) => n + x.sp / ((a[x.p] + a[x.s] / 2) * st.factor), 0);
  const current = evalAttrs(st.attributes);
  let best = null;
  const alloc = [0, 0, 0, 0, 0];
  (function rec(i, left) {
    if (i === 4) {
      if (left > 10) return;
      alloc[4] = left;
      const a = {}; ATTRS.forEach((k, j) => { a[k] = 17 + alloc[j]; });
      const m = evalAttrs(a);
      if (!best || m < best.minutes) best = { minutes: m, attributes: a };
      return;
    }
    for (let x = 0; x <= Math.min(10, left); x++) { alloc[i] = x; rec(i + 1, left - x); }
  })(0, 14);
  return { current: { minutes: current, attributes: st.attributes }, best, savedMinutes: current - best.minutes };
}

/** Requirement check for one type across pilots (live) and imported audits. */
async function canFly(typeId, charIds, audits = {}) {
  const reqs = [...sde.allRequirements(typeId)].map(([id, level]) => ({ id, level, name: (sde.type(id) || {}).name }));
  const pilots = [];
  for (const cid of charIds) {
    const st = await safe(() => charState(cid));
    if (!ok(st)) { pilots.push({ id: cid, error: st.__error }); continue; }
    pilots.push(checkAgainst(cid, null, reqs, st.levels, st.attributes, st.factor, st.sp));
  }
  for (const [cid, a] of Object.entries(audits)) {
    if (charIds.includes(Number(cid)) || !a.skills) continue;
    const levels = new Map();
    for (const g of a.skills) for (const k of g.skills) { const id = sde.typeIdByName(k.name); if (id) levels.set(id, k.level); }
    pilots.push(checkAgainst(Number(cid), a.character.name, reqs, levels, { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 }, 1, new Map(), true));
  }
  return { type: sde.type(typeId), requirements: reqs, pilots };
}

function checkAgainst(cid, name, reqs, levels, attrs, factor, sp, fromAudit = false) {
  const entries = [];
  const have = new Map(levels);
  for (const r of reqs) addToEntries(entries, r.id, r.level, have);
  let minutes = 0;
  for (const e of entries) minutes += timeFor(e, attrs, factor, (levels.get(e.skillId) || 0) === e.level - 1 ? sp.get(e.skillId) : 0).minutes;
  const missing = reqs.filter(r => (levels.get(r.id) || 0) < r.level).map(r => ({ ...r, have: levels.get(r.id) || 0 }));
  const charName = name || (store.get().characters.find(c => c.id === cid) || {}).name || cid;
  return { id: cid, name: charName, canFly: !missing.length, missing, minutes, entries: entries.length, fromAudit };
}

/** Check an arbitrary requirement map (skillId -> level) for live pilots and audits. */
async function checkReqs(reqMap, charIds, audits = {}) {
  const reqs = [...reqMap].map(([id, level]) => ({ id, level, name: (sde.type(id) || {}).name }));
  const out = [];
  for (const cid of charIds) {
    const st = await safe(() => charState(cid));
    if (ok(st)) out.push(checkAgainst(cid, null, reqs, st.levels, st.attributes, st.factor, st.sp));
  }
  for (const [cid, a] of Object.entries(audits)) {
    if (charIds.includes(Number(cid)) || !a.skills) continue;
    const levels = new Map();
    for (const g of a.skills) for (const k of g.skills) { const id = sde.typeIdByName(k.name); if (id) levels.set(id, k.level); }
    out.push(checkAgainst(Number(cid), a.character.name, reqs, levels, { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 }, 1, new Map(), true));
  }
  return { requirements: reqs, pilots: out };
}

module.exports = { checkAgainst, checkReqs, plans, savePlan, deletePlan, addToEntries, addTypeRequirements, parseText, exportText, compute, optimiseRemap, canFly, charState, spFor };
