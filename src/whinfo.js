'use strict';
/* Wormhole system info: class, statics and system effect.
   Statics aren't in CCP's static data; they come from Pathfinder's player-recorded list (MIT licence),
   bundled in data/wh-statics.json. Wormhole type details (destination, mass, lifetime) come from the SDE. */
const sde = require('./sde');
const STATICS = require('./data/wh-statics.json').systems;

const EFFECTS = {
  'Black Hole': 'Faster ships and missiles, but worse agility, shorter targeting range and weaker webs.',
  'Magnetar': 'More damage, but worse tracking, missile explosions and targeting range.',
  'Pulsar': 'More shield HP and faster capacitor recharge, but weaker armour resists, bigger signatures and stronger neuts.',
  'Wolf-Rayet': 'More armour HP, more small weapon damage and smaller signatures, but weaker shield resists.',
  'Cataclysmic Variable': 'Stronger remote repairs and capacitor transfers, but weaker local repairs and slower capacitor recharge.',
  'Red Giant': 'More overheat bonus, heat damage, smartbomb range and damage, and bomb damage.'
};
const CLS = { 1: 'C1', 2: 'C2', 3: 'C3', 4: 'C4', 5: 'C5', 6: 'C6', 12: 'Thera', 13: 'C13', 14: 'Drifter', 15: 'Drifter', 16: 'Drifter', 17: 'Drifter', 18: 'Drifter' };

let typeMap = null;
const types = () => typeMap || (typeMap = new Map(sde.wormholeTypes().map(t => [t.id, t])));

function effectName(sun) {
  if (!sun) return null;
  const k = Object.keys(EFFECTS).find(e => new RegExp(e.replace('-', '[- ]?'), 'i').test(sun));
  return k || null;
}

/** Info for a system id or name. Returns null for k-space systems. */
function info(q) {
  if (!sde.ready()) return null;
  const id = typeof q === 'number' || /^\d+$/.test(String(q)) ? Number(q) : sde.systemIdByName(String(q).trim());
  if (!id) return null;
  const s = sde.system(id);
  if (!s || !(s.regionId >= 11000000 && s.regionId < 12000000)) return null;
  const effect = effectName(s.sun);
  const statics = (STATICS[id] || []).map(tid => {
    const t = types().get(tid);
    return t ? { code: t.code, leadsTo: t.leadsTo, lifeHours: t.lifeHours, totalMass: t.totalMass, jumpMass: t.jumpMass } : { code: String(tid), leadsTo: '?' };
  });
  const shattered = /^J0\d{5}$/i.test(s.name);
  return { id, name: s.name, cls: CLS[s.whClass] || 'J', classId: s.whClass, region: s.region, constellation: s.constellation, effect, effectSummary: effect ? EFFECTS[effect] : null,
    statics, shattered, staticsKnown: !!STATICS[id] };
}

module.exports = { info, effectName, EFFECTS };
