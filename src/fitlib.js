'use strict';
/* Fit library: your own collection of fits, kept on this PC. Fits come from the fit checker, from
   pasted EFT text (one or many), from every pilot's in-game saved fittings, and from corp doctrines.
   Each fit shows which of your pilots can fly it now and how far off the others are. */
const crypto = require('crypto');
const store = require('./store');
const sde = require('./sde');
const fitcheck = require('./fitcheck');
const doctrines = require('./doctrines');
const skillplan = require('./skillplan');
const { safe, ok } = require('./esi');

function lib() { const d = store.get(); d.fits = d.fits || []; return d.fits; }
const norm = eft => String(eft || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l && !/^\[empty .+slot\]$/i.test(l)).slice(1).sort().join('\n');
const key = (shipTypeId, eft) => crypto.createHash('sha1').update(shipTypeId + '|' + norm(eft)).digest('hex').slice(0, 16);

/** Split pasted text into separate EFT fits (each starts with [Ship, Name]). */
function splitEft(text) {
  const out = []; let cur = null;
  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    if (/^\[[^,\]]+,[^\]]*\]\s*$/.test(line.trim())) { if (cur) out.push(cur.join('\n')); cur = [line.trim()]; }
    else if (cur) cur.push(line);
  }
  if (cur) out.push(cur.join('\n'));
  return out.map(s => s.trim()).filter(Boolean);
}

function add(eft, o = {}) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const fit = fitcheck.parse(eft);
  if (!fit.shipTypeId) throw new Error('That isn’t a fit: the first line should be [Ship, Fit name].');
  const L = lib(); const k = key(fit.shipTypeId, fit.eft);
  const ex = L.find(x => x.key === k);
  if (ex) { if (o.folder && !ex.folder) ex.folder = o.folder; store.save('fits'); return { fit: ex, added: false }; }
  const t = sde.type(fit.shipTypeId) || {};
  const f = { id: k, key: k, name: String(o.name || fit.name || fit.ship).slice(0, 80), ship: fit.ship, shipTypeId: fit.shipTypeId, group: t.group || '', eft: fit.eft,
    folder: String(o.folder || '').slice(0, 60), notes: String(o.notes || '').slice(0, 1000), source: o.source || 'pasted', addedAt: new Date().toISOString() };
  L.push(f); store.save('fits');
  return { fit: f, added: true };
}

function importText(text, folder) {
  const parts = splitEft(text);
  if (!parts.length) throw new Error('No fits found. Paste fits in EFT format: each starts with a line like [Vexor, My fit].');
  let added = 0, dupes = 0; const errors = [];
  for (const p of parts) { try { const r = add(p, { folder, source: 'pasted' }); if (r.added) added++; else dupes++; } catch (e) { errors.push(e.message); } }
  return { added, dupes, errors: errors.slice(0, 5) };
}

/** Every pilot's saved in-game fittings. */
async function importGame() {
  const extra = require('./esi-extra'), engine = require('./fitengine');
  let added = 0, dupes = 0; const errors = [];
  for (const c of store.get().characters.filter(x => !x.needsReauth && (x.scopes || []).includes('esi-fittings.read_fittings.v1'))) {
    const r = await safe(() => extra.fittings(c.id));
    if (!ok(r)) { errors.push(`${c.name}: ${r.__error}`); continue; }
    for (const f of r) {
      try { const eft = await engine.eftFromEsi(f.raw); const x = add(eft, { name: f.name, folder: 'In game: ' + c.name, notes: f.description || '', source: 'game' }); if (x.added) added++; else dupes++; }
      catch (e) { errors.push(`${f.name}: ${e.message}`); }
    }
  }
  return { added, dupes, errors: errors.slice(0, 5) };
}

/** Corp doctrines (from the shared workspace). */
function importDoctrines() {
  const ws = require('./workspace').get();
  let added = 0, dupes = 0;
  for (const d of ws.doctrines || []) for (const f of d.fits || []) {
    const eft = f.eft || f.text; if (!eft) continue;
    try { const r = add(eft, { folder: 'Doctrine: ' + (d.name || 'Corp'), source: 'doctrine' }); if (r.added) added++; else dupes++; } catch {}
  }
  return { added, dupes };
}

/** Fits with who can fly each (skills only; the fit checker does CPU/PG and stats). */
async function list() {
  const L = lib();
  const charIds = store.get().characters.filter(c => !c.needsReauth).map(c => c.id);
  const out = [];
  for (const f of L) {
    let pilots = [];
    try { const fit = fitcheck.parse(f.eft); const r = await skillplan.checkReqs(doctrines.requirementsFor(fit), charIds); pilots = r.pilots.map(p => ({ id: p.id, name: p.name, canFly: p.canFly, minutes: p.minutes, missing: p.missing.length })); } catch {}
    out.push({ ...f, pilots, canFly: pilots.filter(p => p.canFly).length });
  }
  return { fits: out.sort((a, b) => (a.folder || '~').localeCompare(b.folder || '~') || a.group.localeCompare(b.group) || a.ship.localeCompare(b.ship) || a.name.localeCompare(b.name)), folders: [...new Set(L.map(f => f.folder).filter(Boolean))].sort() };
}

function update(id, patch = {}) {
  const f = lib().find(x => x.id === id); if (!f) throw new Error('Fit not found.');
  if (typeof patch.name === 'string') f.name = patch.name.slice(0, 80);
  if (typeof patch.folder === 'string') f.folder = patch.folder.slice(0, 60);
  if (typeof patch.notes === 'string') f.notes = patch.notes.slice(0, 1000);
  if (typeof patch.eft === 'string') { const p = fitcheck.parse(patch.eft); if (p.shipTypeId) { f.eft = p.eft; f.ship = p.ship; f.shipTypeId = p.shipTypeId; } }
  store.save('fits'); return f;
}
function remove(id) { const d = store.get(); d.fits = lib().filter(x => x.id !== id); store.save('fits'); return true; }
function exportAll(folder) { return lib().filter(f => !folder || f.folder === folder).map(f => f.eft.replace(/^\[([^,\]]+),[^\]]*\]/, `[$1, ${f.name}]`)).join('\n\n'); }

module.exports = { add, importText, importGame, importDoctrines, list, update, remove, exportAll, splitEft };
