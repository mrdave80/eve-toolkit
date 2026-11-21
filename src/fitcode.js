'use strict';
/* Fit share codes: a pilot turns their fit into a short code to paste in fleet chat or Discord, and the FC pastes
 * everyone's codes into the doctrine check to see who's on the fit and what's missing. Nothing is sent anywhere. */

const zlib = require('zlib');
const sde = require('./sde');

const PREFIX = 'ETFIT1:';
const CODE_RE = /ETFIT1:([A-Za-z0-9_-]{8,})/g;
// Compared: modules, drones, subsystems and fighters. Ammo, scripts and cargo don't decide whether a fit is on doctrine.
const COMPARE_CATS = new Set([7, 18, 32, 87]);

const b64u = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Make a code from an EFT fit (and who's flying it). */
function encode(eft, pilot = '') {
  const f = require('./doctrines').parseEft(eft);
  const body = { v: 1, p: String(pilot || '').slice(0, 40), s: f.shipTypeId, n: f.name.slice(0, 50), m: f.items.map(i => [i.typeId, i.qty]) };
  const code = PREFIX + b64u(zlib.deflateRawSync(Buffer.from(JSON.stringify(body)), { level: 9 }));
  return { code, ship: f.ship, name: f.name, pilot: body.p, length: code.length, unknown: f.unknown };
}

/** Every code in a block of pasted text (chat log, Discord paste, one per line…). */
function decodeAll(text) {
  const out = [], bad = [];
  for (const m of String(text || '').matchAll(CODE_RE)) {
    try {
      const j = JSON.parse(zlib.inflateRawSync(unb64u(m[1])).toString('utf8'));
      if (!j || !j.s || !Array.isArray(j.m)) throw new Error('bad');
      const ship = sde.ready() && sde.type(j.s);
      out.push({ pilot: j.p || '', shipTypeId: Number(j.s), ship: ship ? ship.name : String(j.s), name: j.n || '', items: j.m.map(([t, q]) => ({ typeId: Number(t), qty: Number(q) || 1 })) });
    } catch { bad.push(m[0].slice(0, 24) + '…'); }
  }
  // Latest code per pilot wins (a pilot who refits pastes a new one).
  const byPilot = new Map(); out.forEach((c, i) => byPilot.set(c.pilot || '#' + i, c));
  return { codes: [...byPilot.values()], bad };
}

const counted = items => { const m = new Map(); for (const i of items || []) { const t = sde.ready() && sde.type(i.typeId); if (t && !COMPARE_CATS.has(t.categoryId)) continue; m.set(i.typeId, (m.get(i.typeId) || 0) + (i.qty || 1)); } return m; };
const nm = id => (sde.ready() && sde.type(id) && sde.type(id).name) || String(id);

/** Missing and extra modules between a shared fit and a doctrine fit. */
function diff(shared, docFit) {
  const a = counted(shared.items), b = counted(docFit.items);
  const missing = [], extra = [];
  for (const [t, q] of b) { const have = a.get(t) || 0; if (have < q) missing.push({ typeId: t, name: nm(t), qty: q - have }); }
  for (const [t, q] of a) { const want = b.get(t) || 0; if (q > want) extra.push({ typeId: t, name: nm(t), qty: q - want }); }
  return { missing, extra, exact: !missing.length && !extra.length };
}

/** Compare pasted codes with a doctrine's fits: for each pilot, the closest fit on the same hull and what differs. */
function check(text, fits) {
  const { codes, bad } = decodeAll(text);
  const rows = codes.map(c => {
    const same = (fits || []).filter(f => Number(f.shipTypeId) === c.shipTypeId);
    if (!same.length) return { ...c, status: 'hull', fit: null, missing: [], extra: [] };
    const best = same.map(f => ({ f, d: diff(c, f) })).sort((x, y) => (x.d.missing.length + x.d.extra.length) - (y.d.missing.length + y.d.extra.length))[0];
    return { ...c, status: best.d.exact ? 'ok' : best.d.missing.length ? 'missing' : 'extra', fit: best.f.name || best.f.ship, missing: best.d.missing, extra: best.d.extra };
  });
  const order = { hull: 0, missing: 1, extra: 2, ok: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.pilot.localeCompare(b.pilot));
  return { rows, bad, ok: rows.filter(r => r.status === 'ok').length };
}

module.exports = { encode, decodeAll, diff, check, PREFIX };
