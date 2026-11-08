'use strict';
/* Character value: what a pilot's SP is worth extracted, what it would cost a buyer to inject, and the skills buyers pay extra for. */
const store = require('./store');
const esi = require('./esi');
const market = require('./market');

const LSI = 40520, EXTRACTOR = 40519;
const FLOOR = 5000000, CHUNK = 500000;

// SP a Large Skill Injector gives, by the receiving character's total SP
const injectYield = sp => (sp < 5e6 ? 500000 : sp < 50e6 ? 400000 : sp < 80e6 ? 300000 : 150000);
function injectorsToReach(total) {
  let sp = 0, n = 0;
  const bands = [[5e6, 500000], [50e6, 400000], [80e6, 300000], [Infinity, 150000]];
  for (const [cap, per] of bands) {
    if (sp >= total) break;
    const upto = Math.min(total, cap);
    const need = upto - sp; n += need / per; sp = upto;
  }
  return n;
}

const NOTABLE = [
  [/^Titans?$|^(Amarr|Caldari|Gallente|Minmatar) Titan$/i, 'Titan', 1], [/^(Amarr|Caldari|Gallente|Minmatar) Carrier$|^Carriers?$/i, 'Carrier', 1],
  [/^(Amarr|Caldari|Gallente|Minmatar) Dreadnought$|^Dreadnoughts?$/i, 'Dreadnought', 1], [/Force Auxiliary/i, 'Force Auxiliary', 1],
  [/^Supercarriers?$/i, 'Supercarrier', 1], [/^Capital Industrial Ships$/i, 'Rorqual', 1], [/^Jump Freighters$/i, 'Jump Freighter', 1],
  [/^Jump Drive Calibration$/i, 'Jump Drive Calibration', 5], [/^Cynosural Field Theory$/i, 'Cyno V', 5], [/^Black Ops$/i, 'Black Ops', 1],
  [/^Marauders$/i, 'Marauders', 5], [/^Exhumers$/i, 'Exhumers', 5], [/^Command Ships$/i, 'Command Ships', 5], [/^Logistics Cruisers$/i, 'Logistics', 5]
];

async function value() {
  const d = store.get();
  const prices = await market.prices([LSI, EXTRACTOR], 'Jita');
  const lsiSell = prices[LSI]?.sell ?? prices[LSI]?.avg ?? 0, lsiBuy = prices[LSI]?.buy ?? 0, ext = prices[EXTRACTOR]?.sell ?? prices[EXTRACTOR]?.avg ?? 0;
  const tax = ((d.settings.farm || {}).salesTax ?? 3.37) / 100;
  const perExtract = lsiBuy * (1 - tax) - ext;
  const rows = [];
  for (const c of d.characters || []) {
    const s = await esi.safe(() => esi.skills(c.id));
    if (!esi.ok(s)) { rows.push({ id: c.id, name: c.name, error: s.__error }); continue; }
    const total = (s.totalSp || 0) + (s.unallocatedSp || 0);
    const extractable = Math.max(0, Math.floor((total - FLOOR) / CHUNK));
    const all = s.groups.flatMap(g => g.skills);
    const notable = [];
    for (const [re, label, min] of NOTABLE) { const k = all.find(x => re.test(x.name) && x.level >= min); if (k && !notable.some(n => n.label === label)) notable.push({ label, skill: k.name, level: k.level }); }
    const fives = all.filter(k => k.level === 5).length;
    rows.push({ id: c.id, name: c.name, totalSp: total, unallocated: s.unallocatedSp || 0, skills: all.length, fives,
      extractable, extractValue: extractable * perExtract, injectCost: injectorsToReach(total) * lsiSell, notable });
  }
  return { prices: { lsiSell, lsiBuy, extractor: ext, perExtract, tax }, rows };
}

module.exports = { value, _t: { injectorsToReach, injectYield } };
