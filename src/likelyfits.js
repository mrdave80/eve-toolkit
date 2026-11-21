'use strict';
/* Likely fits for a pilot in Local: which hulls they fly on kills, and how they fitted the same hull the last
 * time they lost one (from the public killmail). It's a guess at what you'll meet, not a scan. */

const sde = require('./sde');

const SLOTS = [['high', 27, 34], ['mid', 19, 26], ['low', 11, 18], ['rig', 92, 99], ['sub', 125, 132]];
const slotOf = flag => { for (const [k, a, b] of SLOTS) if (flag >= a && flag <= b) return k; if (flag === 87) return 'drones'; if (flag === 158 || (flag >= 159 && flag <= 163)) return 'fighters'; return null; };

// What a module tells you about how they fight. Checked against the module name.
const TAGS = [
  [/Warp Scrambler|Warp Disruptor|Heavy Warp/i, 'Point', 'red'],
  [/Stasis Webifier|Stasis Grappler/i, 'Web', 'red'],
  [/Energy Neutralizer|Nosferatu/i, 'Neut', 'red'],
  [/ECM|Burst Jammer/i, 'ECM', 'gold'],
  [/Sensor Dampener/i, 'Damps', 'gold'],
  [/Target Painter/i, 'Painter', ''],
  [/Covert Ops Cloaking/i, 'Covert cloak', 'gold'],
  [/Cloaking Device/i, 'Cloak', 'gold'],
  [/Cynosural Field/i, 'Cyno', 'red'],
  [/Interdiction Sphere|Warp Disruption Field/i, 'Bubble', 'red'],
  [/Smartbomb/i, 'Smartbomb', 'red'],
  [/Remote (Shield|Armor) (Booster|Repairer)|Remote Capacitor/i, 'Logi', 'accent'],
  [/Microwarpdrive/i, 'MWD', ''],
  [/Afterburner/i, 'AB', ''],
  [/Interdiction Nullifier/i, 'Nullified', 'gold'],
  [/Scan Probe Launcher|Expanded Probe/i, 'Probes', '']
];
const WEAPONS = [[/Missile Launcher|Rocket Launcher|Torpedo/i, 'Missiles'], [/Blaster|Railgun/i, 'Hybrids'], [/AutoCannon|Artillery/i, 'Projectiles'], [/Beam Laser|Pulse Laser/i, 'Lasers'], [/Entropic Disintegrator/i, 'Disintegrator'], [/Vorton Projector/i, 'Vorton'], [/Breacher Pod/i, 'Breacher']];
const RANGE = [[/Warp Disruptor|Heavy Warp Disruptor/i, 'long point'], [/Warp Scrambler|Heavy Warp Scrambler/i, 'scram']];

const nameOf = id => (sde.ready() && sde.type(id) && sde.type(id).name) || String(id);
const groupOf = id => { const t = sde.ready() && sde.type(id); return (t && t.group) || ''; };
const isCharge = id => { const t = sde.ready() && sde.type(id); return t ? t.categoryId === 8 : false; };

/** Read a killmail's victim fit into slots, plus the tags and weapon system it shows. */
function readFit(km) {
  const out = { high: [], mid: [], low: [], rig: [], sub: [], drones: [], fighters: [] };
  for (const it of (km.victim && km.victim.items) || []) {
    const s = slotOf(it.flag); if (!s) continue;
    const n = (it.quantity_destroyed || 0) + (it.quantity_dropped || 0) || 1;
    const name = nameOf(it.item_type_id);
    // Charges sit in the same flag as their module; keep modules only.
    if (['high', 'mid', 'low'].includes(s) && (isCharge(it.item_type_id) || (!sde.ready() && n > 1))) continue;
    const ex = out[s].find(x => x.typeId === it.item_type_id);
    if (ex && (s === 'drones' || s === 'fighters')) ex.n += n;
    else if (ex) ex.n += 1;
    else out[s].push({ typeId: it.item_type_id, name, n: s === 'drones' || s === 'fighters' ? n : 1 });
  }
  const all = [...out.high, ...out.mid, ...out.low].map(x => x.name);
  const tags = [];
  for (const [re, label, tone] of TAGS) if (all.some(n => re.test(n)) && !tags.some(t => t.label === label)) tags.push({ label, tone });
  if (tags.some(t => t.label === 'Covert cloak')) { const i = tags.findIndex(t => t.label === 'Cloak'); if (i >= 0) tags.splice(i, 1); }
  const weapon = (WEAPONS.find(([re]) => all.some(n => re.test(n))) || [])[1] || (out.drones.length || out.fighters.length ? 'Drones' : null);
  const point = (RANGE.find(([re]) => all.some(n => re.test(n))) || [])[1] || null;
  const tank = (() => {
    const lowMid = [...out.mid, ...out.low, ...out.rig].map(x => x.name).join(' ');
    const sh = (lowMid.match(/Shield Extender|Shield Booster|Shield Hardener|Multispectrum Shield|Shield (Power )?Relay|Core Defense/gi) || []).length;
    const ar = (lowMid.match(/Armor Plates?|Armor Repairer|Armor Hardener|Multispectrum (Energized|Coating)|Trimark|Energized|Reactive Armor/gi) || []).length;
    return sh > ar ? 'Shield' : ar > sh ? 'Armor' : sh ? 'Mixed' : null;
  })();
  return { slots: out, tags, weapon, point, tank };
}

/** EFT text for a fit read by readFit (so it can be opened in the fit checker). */
function toEft(shipName, label, f) {
  const lines = [`[${shipName}, ${label}]`];
  for (const k of ['low', 'mid', 'high', 'rig', 'sub']) {
    if (!f.slots[k].length) continue;
    lines.push('');
    for (const m of f.slots[k]) for (let i = 0; i < m.n; i++) lines.push(m.name);
  }
  if (f.slots.drones.length) { lines.push(''); for (const d of f.slots.drones) lines.push(`${d.name} x${d.n}`); }
  return lines.join('\n');
}

const mem = new Map();
const TTL = 3 * 3600000;

/**
 * Likely fits for a character: the hulls they fly most on kills (and when they last flew each),
 * with the fit from their latest loss in that hull. Uses the cached Pilot Intel profile.
 */
async function likely(id, { max = 3 } = {}) {
  id = Number(id);
  const hit = mem.get(id);
  if (hit && Date.now() - hit.at < TTL) return { ...hit.data, cached: true };
  const pilotintel = require('./pilotintel');
  const p = await pilotintel.profile(id);
  const { get } = require('./esi');
  const { zk } = require('./zkill');
  const kills = p.killsAll || p.kills || [];
  const losses = p.losses || [];
  // Hulls by kills, each with its last flown date; then hulls they only lost (they still fly them).
  const hulls = new Map();
  for (const k of kills) if (k.ship) { const h = hulls.get(k.ship) || { typeId: k.ship, name: k.shipName || nameOf(k.ship), kills: 0, last: null }; h.kills++; if (!h.last || Date.parse(k.time) > Date.parse(h.last)) h.last = k.time; hulls.set(k.ship, h); }
  for (const l of losses) if (l.ship && !hulls.has(l.ship)) hulls.set(l.ship, { typeId: l.ship, name: l.shipName || nameOf(l.ship), kills: 0, last: l.time });
  // Skip capsules and shuttles: they're not a fit anyone needs to plan for.
  const skip = n => /^Capsule|Shuttle$/i.test(n || '');
  const ranked = [...hulls.values()].filter(h => !skip(h.name)).sort((a, b) => b.kills - a.kills || Date.parse(b.last || 0) - Date.parse(a.last || 0));
  const out = [];
  for (const h of ranked.slice(0, Math.max(max, 1) + 2)) {
    if (out.length >= max) break;
    const loss = losses.filter(l => l.ship === h.typeId).sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0] || null;
    let fit = null;
    if (loss) {
      try {
        const z = await zk(`/killID/${loss.id}/`, 24 * 3600000);
        const hash = Array.isArray(z) && z[0] && z[0].zkb && z[0].zkb.hash;
        if (hash) { const km = await get(`/killmails/${loss.id}/${hash}/`); fit = readFit(km); fit.eft = toEft(h.name, `${p.name} lost ${String(loss.time || '').slice(0, 10)}`, fit); }
      } catch { /* show the hull without a fit */ }
    }
    out.push({ typeId: h.typeId, name: h.name, group: groupOf(h.typeId), kills: h.kills, lastFlown: h.last,
      loss: loss ? { id: loss.id, time: loss.time, value: loss.value, system: loss.system } : null, fit });
  }
  const data = { id, name: p.name, hulls: out, totalKills: kills.length, at: new Date().toISOString() };
  mem.set(id, { at: Date.now(), data });
  return data;
}

module.exports = { likely, readFit, toEft, slotOf };
