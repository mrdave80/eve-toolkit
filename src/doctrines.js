// Doctrines: EFT fits, combined requirements, cost and who can fly them.
const sde = require('./sde');
const market = require('./market');
const skillplan = require('./skillplan');

/** Parse an EFT block. Handles "[Ship, Name]", "Module, Charge", "Item xN", empty-slot lines. */
function parseEft(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim());
  const head = lines.find(l => /^\[.+,.+\]$/.test(l));
  if (!head) throw new Error('Not an EFT fit. It should start with a line like [Ishtar, My fit name].');
  const [, shipName, fitName] = /^\[([^,]+),\s*(.+)\]$/.exec(head);
  const shipTypeId = sde.typeIdByName(shipName);
  if (!shipTypeId) throw new Error(`Unknown ship "${shipName}".`);
  const items = new Map(), unknown = [];
  const add = (name, qty) => {
    name = name.replace(/\s*\/OFFLINE$/i, '').trim();
    if (!name || /^\[empty .+slot\]$/i.test(name)) return;
    const id = sde.typeIdByName(name);
    if (!id) { unknown.push(name); return; }
    items.set(id, (items.get(id) || 0) + qty);
  };
  for (const l of lines.slice(lines.indexOf(head) + 1)) {
    if (!l || l.startsWith('[')) continue;
    const q = /^(.+?)\s+x(\d+)$/i.exec(l);
    if (q) { add(q[1], Number(q[2])); continue; }
    const [mod, charge] = l.split(',').map(x => x.trim());
    add(mod, 1);
    if (charge) add(charge, 1);
  }
  return {
    ship: shipName.trim(), shipTypeId, name: fitName.trim(), eft: text.trim(), unknown,
    items: [...items.entries()].map(([id, qty]) => ({ typeId: id, name: (sde.type(id) || {}).name, qty }))
  };
}

function requirementsFor(fit) {
  const acc = new Map();
  for (const id of [fit.shipTypeId, ...fit.items.map(i => i.typeId)]) {
    for (const [s, l] of sde.allRequirements(id)) acc.set(s, Math.max(acc.get(s) || 0, l));
  }
  return acc;
}

async function evaluate(doctrine, charIds, audits, hub = 'Jita') {
  const ids = new Set();
  for (const f of doctrine.fits) { ids.add(f.shipTypeId); f.items.forEach(i => ids.add(i.typeId)); }
  const prices = await market.prices([...ids], hub);
  const price = id => { const p = prices[id]; return p ? (p.sell ?? p.avg ?? 0) : 0; };
  const fits = [];
  const pilotBest = new Map();
  for (const f of doctrine.fits) {
    const reqs = requirementsFor(f);
    const check = await skillplan.checkReqs(reqs, charIds, audits);
    const cost = price(f.shipTypeId) + f.items.reduce((n, i) => n + price(i.typeId) * i.qty, 0);
    fits.push({ id: f.id, name: f.name, ship: f.ship, shipTypeId: f.shipTypeId, cost, hullCost: price(f.shipTypeId), requirements: check.requirements.length, pilots: check.pilots });
    for (const p of check.pilots) {
      const cur = pilotBest.get(p.id);
      if (!cur || (p.canFly && !cur.canFly) || (!cur.canFly && !p.canFly && p.minutes < cur.minutes)) pilotBest.set(p.id, { ...p, fit: f.name });
    }
  }
  const pilots = [...pilotBest.values()].sort((a, b) => (b.canFly - a.canFly) || a.minutes - b.minutes);
  return { fits, pilots, canFly: pilots.filter(p => p.canFly).length };
}

module.exports = { parseEft, requirementsFor, evaluate };
