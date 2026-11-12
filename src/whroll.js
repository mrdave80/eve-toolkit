'use strict';
/* Rolling planner: which ships to send through a wormhole, cold or hot, so it collapses without
   leaving anyone on the far side. Wormhole total mass varies by ±10% per hole, so the plan uses the
   lowest possible mass for every jump out and the highest for "closed for sure". */

// Ship masses in kg. Hot = 100MN microwarpdrive running (+50,000 t); Higgs = Higgs Anchor rig (mass ×2).
const PRESETS = [
  { key: 'bs', name: 'Battleship (100MN MWD)', cold: 100e6, hot: 150e6 },
  { key: 'bs-higgs', name: 'Battleship + Higgs Anchor', cold: 200e6, hot: 250e6 },
  { key: 'orca', name: 'Orca (100MN MWD)', cold: 250e6, hot: 300e6 },
  { key: 'hic', name: 'Heavy Interdictor (rolling fit)', cold: 13e6, hot: 63e6 },
  { key: 'bc', name: 'Battlecruiser (50MN MWD)', cold: 15e6, hot: 30e6 }
];
const VAR = 0.1;
const STATE_RANGE = { stable: [0.5, 1], destab: [0.1, 0.5], crit: [0, 0.1] };

/** Remaining mass now: [lowest, highest] possible. `through` = mass already sent since the hole was fresh (if known). */
function remaining(total, state = 'stable', through = 0) {
  const [a, b] = STATE_RANGE[state] || STATE_RANGE.stable;
  let lo = Math.max(a * total * (1 - VAR), total * (1 - VAR) - through, 0);
  let hi = Math.min(b * total * (1 + VAR), total * (1 + VAR) - through);
  if (state === 'crit') lo = 0;
  if (hi < lo) hi = lo;
  return { lo, hi, nominal: Math.max(0, Math.min(hi, Math.max(lo, (state === 'stable' ? total - through : (a + b) / 2 * total)))) };
}

/**
 * o: { total, jumpMass, state, through, ships: [{ name, cold, hot, count }] }
 * Each step is one ship going out and coming back. Steps stop when the next jump out could
 * close the hole behind the ship (stranding it) or when the hole is closed for sure.
 */
function plan(o) {
  const total = Number(o.total) || 0;
  if (total <= 0) throw new Error('Enter the wormhole\'s total mass.');
  const maxJ = Number(o.jumpMass) || Infinity;
  const ships = (o.ships || []).filter(s => Number(s.cold) > 0).map(s => ({ name: s.name || 'Ship', cold: Number(s.cold), hot: Math.max(Number(s.hot) || 0, Number(s.cold)), count: Math.max(1, Number(s.count) || 1) }));
  if (!ships.length) throw new Error('Add at least one rolling ship.');
  const tooBig = ships.filter(s => s.cold > maxJ);
  const usable = ships.filter(s => s.cold <= maxJ);
  if (!usable.length) throw new Error(`None of these ships fit through: the most one jump can take is ${Math.round(maxJ / 1e6)}k t.`);
  const r = remaining(total, o.state, Number(o.through) || 0);
  // Through-mass (since fresh) where the hole should start to look reduced / critical, for a nominal hole
  const start = (Number(o.through) || 0);
  const crossed = (b, a) => { const tb = start + b, ta = start + a; return tb < total * 0.5 && ta >= total * 0.5 ? 'destab' : tb < total * 0.9 && ta >= total * 0.9 ? 'crit' : null; };
  const steps = [];
  let used = 0, outcome = null;
  const legs = s => [{ mode: 'hot', m: s.hot <= maxJ ? s.hot : null }, { mode: 'cold', m: s.cold }].filter(x => x.m);
  for (let n = 0; n < 60; n++) {
    if (used >= r.hi) { outcome = 'closed'; break; }
    // Biggest jump out that can't close the hole in the worst case, then the biggest jump back
    let best = null;
    for (const s of usable) for (const out of legs(s)) {
      if (used + out.m >= r.lo) continue;
      const back = legs(s)[0];
      const tot = out.m + back.m;
      if (!best || tot > best.tot || (tot === best.tot && s.cold < best.s.cold)) best = { s, out, back, tot };
    }
    if (!best) { outcome = 'stop'; break; }
    const before = used;
    used += best.out.m + best.back.m;
    steps.push({ n: steps.length + 1, ship: best.s.name, out: best.out.mode, outMass: best.out.m, back: best.back.mode, backMass: best.back.m, before, after: used,
      mayClose: used >= r.lo, willClose: used >= r.hi, check: crossed(before, used) });
  }
  // Groups of ships can share a step if the fleet has several of them: show how many round trips per ship
  const trips = {};
  for (const s of steps) trips[s.ship] = (trips[s.ship] || 0) + 1;
  const left = { lo: Math.max(0, r.lo - used), hi: Math.max(0, r.hi - used) };
  let advice;
  if (outcome === 'closed') advice = 'The hole is closed for sure by the last jump back.';
  else if (!steps.length && o.state === 'crit') advice = 'It is already critical: any jump out could close it behind you. Only send a ship that can be left on the far side, or one that can take another way home.';
  else {
    const smallest = Math.min(...usable.map(s => s.cold));
    advice = left.lo > 0
      ? `Next, look at the hole. ${left.hi > 0 ? `Between ${fmt(left.lo)} and ${fmt(left.hi)} left.` : ''} A jump out heavier than ${fmt(left.lo)} could strand that ship; the smallest you have is ${fmt(smallest)}.`
      : `Between 0 and ${fmt(left.hi)} left. Any jump out could now strand a ship: check whether it shows as critical, then finish it with a ship that can be left behind, or jump from the far side.`;
  }
  return { total, jumpMass: Number.isFinite(maxJ) ? maxJ : null, range: r, steps, used, left, outcome: outcome || 'stop', advice, trips, tooBig: tooBig.map(s => s.name) };
}
const fmt = kg => `${Math.round(kg / 1e6).toLocaleString('en-US')}k t`;

module.exports = { plan, remaining, PRESETS };
