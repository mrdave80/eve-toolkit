'use strict';
/* Site Check: is this fit (with these skills) suitable for a combat site? Reads the site name for the faction,
 * the tier and any DED rating, then checks the fit's tank against the damage that faction deals, its damage
 * against what they're weak to, capacitor against neuts, the EWAR they use and any ship-size gate.
 * Faction damage and EWAR are from EVE University's NPC damage types page. The DPS and repair figures per tier
 * are a rule of thumb for a comfortable clear, not CCP numbers. */

const sde = require('./sde');

// [key, label, name pattern, damage dealt {em, th, ki, ex}, weak to, ewar]
const FACTIONS = [
  ['angel', 'Angel Cartel', /\bangel|\bdomination|\bgist/i, { ex: 0.62, ki: 0.22, th: 0.08, em: 0.08 }, ['ex', 'ki'], ['tp']],
  ['blood', 'Blood Raiders', /\bblood|\bcorpus|\bcorpii|dark blood/i, { em: 0.50, th: 0.48, ki: 0.01, ex: 0.01 }, ['em', 'th'], ['neut', 'td']],
  ['guristas', 'Guristas', /\bgurista|\bpith|dread guristas/i, { ki: 0.79, th: 0.18, em: 0.015, ex: 0.015 }, ['ki', 'th'], ['ecm']],
  ['sansha', "Sansha's Nation", /\bsansha|\bcentus|\bcentii|true sansha/i, { em: 0.53, th: 0.47, ki: 0, ex: 0 }, ['em', 'th'], ['td']],
  ['serpentis', 'Serpentis', /\bserpentis|\bcoreli|\bshadow serpentis/i, { th: 0.55, ki: 0.45, em: 0, ex: 0 }, ['ki', 'th'], ['damp']],
  ['drone', 'Rogue Drones', /\bdrone|\bhive|\bswarm/i, { em: 0.25, th: 0.25, ki: 0.25, ex: 0.25 }, ['em', 'th'], []],
  ['sleeper', 'Sleepers', /\bsleeper|perimeter|frontier|core (garrison|stronghold|citadel|bastion)|fortification|outpost|solar cell|oruze|barracks|stronghold|citadel|bastion/i, { em: 0.25, th: 0.25, ki: 0.25, ex: 0.25 }, ['em', 'th', 'ki', 'ex'], ['neut']],
  ['mordu', "Mordu's Legion", /\bmordu/i, { ki: 0.70, th: 0.30, em: 0, ex: 0 }, ['ki', 'em'], []],
  ['merc', 'Mercenaries', /\bmercenar/i, { ki: 0.5, th: 0.5, em: 0, ex: 0 }, ['ki', 'th'], []]
];
const DMG = { em: 'EM', th: 'Thermal', ki: 'Kinetic', ex: 'Explosive' };
const DMG_IDX = { em: 0, th: 1, ki: 2, ex: 3 };   // order of the engine's resist arrays
const EWAR = {
  neut: ['Energy neutralizers', 'They drain your capacitor. Lasers, active repairers and hardeners all stop when it runs dry, so be cap stable or carry a capacitor booster.'],
  td: ['Tracking disruptors', 'Your turrets lose range and tracking. Drones and missiles aren’t affected.'],
  ecm: ['ECM jamming', 'You can lose your locks. Drones already attacking keep going, and an ECCM or a sensor booster helps.'],
  damp: ['Sensor dampeners', 'Your lock range and lock speed drop. Fight closer, or fit a sensor booster.'],
  tp: ['Target painters', 'They make you a bigger target, so their missiles and big guns hit you harder. Speed and a small signature help less.'],
  web: ['Stasis webifiers', 'You’ll be slowed. Speed tanking won’t work up close.'],
  scram: ['Warp scramblers', 'You can be held on grid. Watch for it before deciding to warp out.']
};

// Tiers of the pirate anomalies, from EVE University. dps/rep: a rule of thumb for a comfortable clear.
const FAMILIES = [
  ['hideaway', 'Hideaway', 1, 'frigates', 'high and low sec', 60, 25],
  ['burrow', 'Burrow', 2, 'about a dozen frigates', 'high and low sec', 100, 40],
  ['refuge', 'Refuge', 3, 'frigates and destroyers', 'high and low sec', 150, 60],
  ['den', 'Den', 4, 'frigates, destroyers and cruisers', 'high and low sec (the variants in low and null)', 200, 90],
  ['yard', 'Yard', 5, 'cruisers and battlecruisers', 'low sec', 300, 140],
  ['rally', 'Rally Point', 6, 'frigates to battlecruisers, with a battleship or two (around 37 ships)', 'low and null sec', 400, 200],
  ['port', 'Port', 7, 'around 25–30 ships, battleships among them', 'low and null sec', 500, 250],
  ['hub', 'Hub', 8, 'around 27 ships, battleships among them', 'low and null sec', 550, 300],
  ['haven', 'Haven', 9, 'battlecruisers and battleships', 'null sec', 650, 350],
  ['sanctum', 'Sanctum', 10, 'battlecruisers and battleships, with rare faction and capital spawns', 'null sec', 750, 400]
];
// Variants are harder than the plain site of the same name.
const VARIANTS = [['hidden', 'Hidden', 1.15], ['forsaken', 'Forsaken', 1.35], ['forlorn', 'Forlorn', 1.5]];
// Rogue drone anomalies use their own names, one per tier.
const DRONE_FAMILIES = ['Cluster', 'Collection', 'Assembly', 'Gathering', 'Surveillance', 'Menagerie', 'Herd', 'Squad', 'Patrol', 'Horde'];
// DED gates: highest ship class allowed in (EVE University).
const DED_GATE = { 1: 'frigate', 2: 'destroyer', 3: 'cruiser', 4: 'battlecruiser' };
const CLASS_RANK = { frigate: 1, destroyer: 2, cruiser: 3, battlecruiser: 4, battleship: 5, capital: 6 };

/** Ship class of a hull from its group name. */
function shipClass(typeId) {
  const t = sde.ready() && sde.type(typeId); const g = (t && t.group) || '';
  if (/frigate|interceptor|covert ops|stealth bomber|electronic attack|prototype exploration/i.test(g)) return 'frigate';
  if (/destroyer|interdictor/i.test(g)) return 'destroyer';
  if (/battlecruiser|command ship/i.test(g)) return 'battlecruiser';
  if (/battleship|black ops|marauder/i.test(g)) return 'battleship';
  if (/cruiser|recon|logistics(?! frigate)|interdiction cruiser|expedition command/i.test(g)) return 'cruiser';
  if (/carrier|dreadnought|force auxiliary|titan|supercarrier/i.test(g)) return 'capital';
  return null;
}

/** Read a site name: faction, tier, variant and DED rating. */
function parseSite(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Type a site name, such as Blood Den, Guristas Forsaken Hub or a 4/10 DED.');
  const f = FACTIONS.find(x => x[2].test(n)) || null;
  let fam = null, tier = null;
  const dm = DRONE_FAMILIES.findIndex(x => new RegExp(`\\b${x}\\b`, 'i').test(n));
  if (f && f[0] === 'drone' && dm >= 0) { fam = { key: DRONE_FAMILIES[dm].toLowerCase(), label: DRONE_FAMILIES[dm] }; tier = dm + 1; }
  else {
    const m = FAMILIES.find(([k, label]) => new RegExp(`\\b${label.replace(' ', '\\s*')}\\b`, 'i').test(n) || (k === 'rally' && /rally/i.test(n)));
    if (m) { fam = { key: m[0], label: m[1] }; tier = m[2]; }
  }
  const fams = FAMILIES.find(x => x[2] === tier) || null;
  const v = VARIANTS.find(([k]) => new RegExp(`\\b${k}\\b`, 'i').test(n)) || null;
  const ded = /\b(\d{1,2})\s*\/\s*10\b/.exec(n);
  const dedLevel = ded ? Math.min(10, Number(ded[1])) : null;
  const mult = v ? v[2] : 1;
  // DED complexes run hotter than the anomaly of the same tier.
  const want = dedLevel ? { dps: 120 + dedLevel * 70, rep: 50 + dedLevel * 35 } : fams ? { dps: Math.round(fams[5] * mult), rep: Math.round(fams[6] * mult) } : null;
  return {
    name: n, faction: f ? { key: f[0], label: f[1], deals: f[3], weak: f[4], ewar: f[5] } : null,
    family: fam, tier, variant: v ? v[1] : null, ded: dedLevel,
    enemies: fams && !dedLevel ? fams[3] : null, space: fams && !dedLevel ? fams[4] : null,
    gate: dedLevel && DED_GATE[dedLevel] ? DED_GATE[dedLevel] : null, want
  };
}

// Damage type of what the fit shoots, from module, charge and drone names.
const DRONE_DMG = [[/acolyte|infiltrator|praetor|curator|templar|dragonfly|firbolg|einherji|gecko/i, 'em'], [/hobgoblin|hammerhead|ogre|garde/i, 'th'], [/hornet|vespa|wasp|warden|cyclops/i, 'ki'], [/warrior|valkyrie|berserker|bouncer|siren/i, 'ex']];
const CHARGE_DMG = [
  [/scorch|conflagration|multifrequency|ultraviolet|xray|gamma|standard|infrared|microwave|radio|gleam|aurora/i, ['em', 'th']],
  [/mjolnir/i, ['em']], [/inferno/i, ['th']], [/scourge/i, ['ki']], [/nova/i, ['ex']],
  [/antimatter|iridium|lead|thorium|uranium|plutonium|tungsten|iron charge|void|null|javelin|spike/i, ['ki', 'th']],
  [/emp\b|fusion|phased plasma|titanium sabot|depleted uranium|nuclear|proton|carbonized|barrage|hail|quake|tremor/i, ['ex', 'ki']],
  [/exotic plasma|baryon|meson|tetryon|occult|mystic/i, ['th', 'ki']]
];
const WEAPON_KIND = [[/laser|beam/i, 'Lasers', ['em', 'th']], [/blaster|railgun/i, 'Hybrids', ['ki', 'th']], [/autocannon|artillery|howitzer/i, 'Projectiles', ['ex', 'ki']], [/launcher/i, 'Missiles', null], [/disintegrator/i, 'Disintegrators', ['th', 'ex']], [/vorton/i, 'Vorton projectors', ['em', 'ex']]];

function damageOf(fit) {
  const out = { weapons: [], drones: [] };
  for (const m of (fit.slots && fit.slots.high) || []) {
    if (m.empty) continue;
    const w = WEAPON_KIND.find(([re]) => re.test(m.name)); if (!w) continue;
    const c = m.charge ? CHARGE_DMG.find(([re]) => re.test(m.charge)) : null;
    out.weapons.push({ name: m.name, kind: w[1], charge: m.charge || null, types: (c && c[1]) || w[2] || [] });
  }
  for (const d of fit.drones || []) { const t = DRONE_DMG.find(([re]) => re.test(d.name)); out.drones.push({ name: d.name, qty: d.qty, type: t ? t[1] : null }); }
  return out;
}

/** Resist modules and rigs aimed at a damage type the site doesn't deal. */
function resistMismatch(fit, deals) {
  const minor = Object.entries(deals).filter(([, v]) => v < 0.15).map(([k]) => k);
  const out = [];
  for (const list of Object.values(fit.slots || {})) for (const m of list || []) {
    if (m.empty) continue;
    const t = Object.keys(DMG).find(k => new RegExp(`\\b${DMG[k]}\\b.*(reinforcer|hardener|amplifier|membrane|coating|plating|screen|ward)|(reinforcer|hardener|amplifier|membrane|coating|plating|screen|ward).*\\b${DMG[k]}\\b`, 'i').test(m.name));
    if (t && minor.includes(t)) out.push({ module: m.name, type: DMG[t] });
  }
  return out;
}

/** Check a fit (from fitcheck.check) against a site. statsFor: a pilot id, or null for all skills V. */
function evaluate(site, fit, statsFor) {
  const st = (statsFor && fit.engine && fit.engine.pilots && fit.engine.pilots[statsFor]) || (fit.engine && fit.engine.allV);
  const points = [];   // { level: 'good'|'warn'|'bad', text }
  const say = (level, text) => points.push({ level, text });
  const cls = shipClass(fit.shipTypeId);

  // Gate
  if (site.gate && cls && CLASS_RANK[cls] > CLASS_RANK[site.gate]) say('bad', `A ${cls} can’t use the acceleration gate: a ${site.ded}/10 takes up to a ${site.gate}.`);
  else if (site.gate && cls) say('good', `The gate takes up to a ${site.gate}, so the ${fit.ship} fits through.`);
  if (site.ded && site.ded <= 4 && /strategic cruiser/i.test(((sde.ready() && sde.type(fit.shipTypeId)) || {}).group || '')) say('bad', 'T3 cruisers can’t take the gate into DED sites below 5/10.');

  const deals = site.faction ? site.faction.deals : { em: 0.25, th: 0.25, ki: 0.25, ex: 0.25 };
  let tank = null;
  if (st) {
    // Tank layer: the one with the most repair, or the most HP if nothing repairs.
    const reps = st.rep || {}, layers = st.layers || {};
    const layer = ['shield', 'armor', 'hull'].sort((a, b) => (reps[b] || 0) - (reps[a] || 0) || (layers[b] || 0) - (layers[a] || 0))[0];
    const res = (st.resists && st.resists[layer]) || [0, 0, 0, 0];
    const weighted = Object.entries(deals).reduce((n, [k, w]) => n + w * (res[DMG_IDX[k]] || 0), 0);
    const repRaw = (reps[layer] || 0) + (layer === 'shield' ? reps.passive || 0 : 0);
    const repEff = weighted < 0.99 ? repRaw / (1 - weighted) : repRaw;
    const ehp = ['shield', 'armor', 'hull'].reduce((n, l) => { const r = (st.resists && st.resists[l]) || [0, 0, 0, 0]; const w = Object.entries(deals).reduce((x, [k, v]) => x + v * (r[DMG_IDX[k]] || 0), 0); return n + ((st.hp && st.hp[l]) || 0) / Math.max(0.01, 1 - w); }, 0);
    const holes = Object.entries(deals).filter(([, w]) => w >= 0.15).map(([k]) => ({ k, r: res[DMG_IDX[k]] || 0 })).filter(x => x.r < 0.55);
    tank = { layer, weighted, repRaw, repEff, ehp, cap: st.cap, dps: st.dps, droneDps: st.droneDps, weaponDps: st.weaponDps, resists: res };
    if (site.want) {
      if (repEff >= site.want.rep) say('good', `Tank: about ${Math.round(repEff)} HP/s repaired against ${site.faction ? site.faction.label : 'their'} damage (${Math.round(weighted * 100)}% resist on ${layer}). A rough guide for this site is ${site.want.rep}.`);
      else if (repEff >= site.want.rep * 0.6) say('warn', `Tank: about ${Math.round(repEff)} HP/s repaired against their damage, under the rough ${site.want.rep} for this site. Keep range, kill the damage dealers first, and watch your armour or shield.`);
      else say('bad', `Tank: about ${Math.round(repEff)} HP/s repaired against their damage, well under the rough ${site.want.rep} for this site. It’ll live on ${Math.round(ehp / 1000)}k EHP and range, not on repairs.`);
    }
    for (const h of holes) say('warn', `${DMG[h.k]} resist on ${layer} is ${Math.round(h.r * 100)}%, and ${site.faction ? site.faction.label : 'they'} deal ${Math.round(deals[h.k] * 100)}% ${DMG[h.k]}.`);
    if (site.want) {
      if (st.dps >= site.want.dps) say('good', `Damage: about ${Math.round(st.dps)} DPS (${Math.round(st.weaponDps)} guns or missiles, ${Math.round(st.droneDps)} drones). A rough guide is ${site.want.dps}.`);
      else if (st.dps >= site.want.dps * 0.6) say('warn', `Damage: about ${Math.round(st.dps)} DPS, under the rough ${site.want.dps}. It’ll clear, slowly, and reinforcements may stack up.`);
      else say('bad', `Damage: about ${Math.round(st.dps)} DPS, well under the rough ${site.want.dps} for this site.`);
    }
    // Capacitor
    const capUsers = [];
    for (const m of [...(fit.slots.high || []), ...(fit.slots.med || []), ...(fit.slots.low || [])]) if (!m.empty && /laser|repairer|shield booster|hardener|afterburner|microwarpdrive|reactive armor/i.test(m.name)) capUsers.push(m.name);
    const neuts = site.faction && site.faction.ewar.includes('neut');
    if (st.cap && !st.cap.stable && st.cap.lastsSeconds !== null) {
      const mins = Math.round(st.cap.lastsSeconds / 60);
      say(neuts && st.cap.lastsSeconds < 90 ? 'bad' : 'warn', `Capacitor runs out in about ${mins < 1 ? 'under a minute' : mins + ' min'} with everything on${neuts ? ', before their neuts' : ''}.${capUsers.length ? ` It feeds ${[...new Set(capUsers)].slice(0, 4).join(', ')}.` : ''}${neuts ? ' Fit a capacitor booster with charges, or pulse the repairer.' : ''}`);
    } else if (st.cap && st.cap.stable) say(neuts ? 'warn' : 'good', `Cap stable at ${Math.round(st.cap.stableAt)}%${neuts ? ', but their neuts will pull it down: watch it when several are on you.' : '.'}`);
  } else say('warn', 'Fit stats aren’t available yet, so only the site and damage types are checked.');

  // Damage types against their weaknesses
  if (site.faction) {
    const weak = site.faction.weak;
    const dmg = damageOf(fit);
    const goodW = dmg.weapons.filter(w => w.types.some(t => weak.includes(t)));
    const badW = dmg.weapons.filter(w => w.types.length && !w.types.some(t => weak.includes(t)));
    if (goodW.length && !badW.length) say('good', `${goodW[0].kind}${goodW[0].charge ? ` with ${goodW[0].charge}` : ''} deal ${goodW[0].types.map(t => DMG[t]).join(' and ')}, what ${site.faction.label} are weak to.`);
    if (badW.length) say('warn', `${badW[0].kind}${badW[0].charge ? ` with ${badW[0].charge}` : ''} deal ${badW[0].types.map(t => DMG[t]).join(' and ')}; ${site.faction.label} are weak to ${weak.map(t => DMG[t]).join(' and ')}.${badW[0].kind === 'Missiles' || badW[0].kind === 'Lasers' ? '' : ' Switch ammo if you can.'}`);
    const dGood = dmg.drones.filter(d => d.type && weak.includes(d.type)).map(d => d.name), dBad = dmg.drones.filter(d => d.type && !weak.includes(d.type)).map(d => d.name);
    if (dGood.length) say('good', `Best drones here: ${[...new Set(dGood)].join(', ')} (${weak.map(t => DMG[t]).join(' or ')}).`);
    if (dBad.length && dGood.length) say('info', `Keep ${[...new Set(dBad)].join(', ')} for when the others are down: wrong damage type for ${site.faction.label}.`);
    const main = Object.entries(deals).sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 0.15).map(([k]) => DMG[k]);
    for (const x of resistMismatch(fit, deals)) say('warn', `${x.module} resists ${x.type}, which ${site.faction.label} barely deal. ${main.join(' or ')} would do more here.`);
    for (const e of site.faction.ewar) say('info', `${EWAR[e][0]}: ${EWAR[e][1]}`);
  }
  if (site.ded && site.ded >= 5) say('info', 'DED complexes often have a scrambling or webbing boss room: don’t count on warping out mid-fight.');

  const bad = points.filter(p => p.level === 'bad').length, warn = points.filter(p => p.level === 'warn').length;
  const verdict = bad ? 'Not suitable' : warn > 2 ? 'Risky' : warn ? 'Suitable, with care' : 'Suitable';
  return { verdict, tone: bad ? 'red' : warn > 2 ? 'gold' : warn ? 'accent' : 'green', points, tank, shipClass: cls };
}

/** Names for the site box's suggestions. */
function names() {
  const out = [];
  const pre = { angel: 'Angel', blood: 'Blood', guristas: 'Guristas', sansha: 'Sansha', serpentis: 'Serpentis' };
  for (const p of Object.values(pre)) for (const f of FAMILIES) { out.push(`${p} ${f[1]}`); for (const v of VARIANTS) out.push(`${p} ${v[1]} ${f[1]}`); }
  DRONE_FAMILIES.forEach(x => out.push(`Drone ${x}`));
  for (let i = 1; i <= 10; i++) if (i !== 9) for (const p of Object.values(pre)) out.push(`${p} ${i}/10 DED`);
  return out;
}

module.exports = { parseSite, evaluate, shipClass, damageOf, resistMismatch, names, FACTIONS, FAMILIES };
