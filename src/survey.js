'use strict';
/* Belt tracker: the in-game Mining Survey Results window, copied (Ctrl+A, Ctrl+C) and pasted.
   Rows are tab separated: name, quantity, volume ("1,234 m3"), value ("12,345.00 ISK" or "-"), distance
   ("12 km" or "850 m"). A line with only a name is an ore heading; rows without a name belong to it. */

const num = s => Number(String(s || '').replace(/[^\d.]/g, '')) || 0;

function parse(text) {
  const rows = [];
  let heading = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = line.split('\t').map(x => x.trim());
    if (c.length === 1 || c.slice(1).every(x => !x)) { heading = c[0]; continue; }
    while (c.length > 5 && !c[0]) c.shift();   // indented rows under a heading
    if (c.length < 5) continue;
    const [name, qty, vol, isk, dist] = c;
    if (!/^[\d,.\s]+m(3|³)$/i.test(vol)) continue;
    const dm = /^([\d,.\s]+)\s*(km|m|au)$/i.exec(dist);
    const km = dm ? num(dm[1]) * (dm[2].toLowerCase() === 'km' ? 1 : dm[2].toLowerCase() === 'm' ? 0.001 : 149597870.7) : null;
    rows.push({ ore: name || heading, qty: num(qty), m3: num(vol.replace(/m(3|³)\s*$/i, '')), isk: /isk/i.test(isk) ? num(isk) : null, km });
  }
  return rows;
}
const isSurvey = text => parse(text).length > 0 && /m3|m³/i.test(text) && /\t/.test(text) && /\b(km|m)\b/.test(text);

/** Totals for one snapshot: everything, and within range (km) of you. */
function totals(rows, rangeKm) {
  const t = { qty: 0, m3: 0, isk: 0, rocks: rows.length, near: { qty: 0, m3: 0, isk: 0, rocks: 0 }, ores: {} };
  for (const r of rows) {
    t.qty += r.qty; t.m3 += r.m3; t.isk += r.isk || 0;
    const o = t.ores[r.ore] = t.ores[r.ore] || { ore: r.ore, qty: 0, m3: 0, isk: 0, rocks: 0, nearM3: 0 };
    o.qty += r.qty; o.m3 += r.m3; o.isk += r.isk || 0; o.rocks++;
    if (rangeKm && r.km !== null && r.km <= rangeKm) { t.near.qty += r.qty; t.near.m3 += r.m3; t.near.isk += r.isk || 0; t.near.rocks++; o.nearM3 += r.m3; }
  }
  t.ores = Object.values(t.ores).sort((a, b) => b.m3 - a.m3);
  return t;
}

/**
 * snaps: [{ at (ms), rows }], oldest first. o: { rangeKm, m3PerMin (your own rate, used when there's only one snapshot) }
 * Rate comes from the first and last snapshot; per ore too, so you see which ore runs out first.
 */
function analyse(snaps, o = {}) {
  if (!snaps.length) return null;
  const rangeKm = Number(o.rangeKm) || 0;
  const list = snaps.map(s => ({ at: s.at, t: totals(s.rows, rangeKm) }));
  const first = list[0], last = list[list.length - 1];
  const mins = (last.at - first.at) / 60000;
  let rate = null;
  if (list.length > 1 && mins > 0.2) {
    const dm3 = first.t.m3 - last.t.m3, disk = first.t.isk - last.t.isk, dnear = first.t.near.m3 - last.t.near.m3;
    rate = { m3: Math.max(0, dm3 / mins), isk: Math.max(0, disk / mins), nearM3: Math.max(0, dnear / mins), source: 'scans', minutes: mins };
  } else if (Number(o.m3PerMin) > 0) {
    const perM3 = last.t.m3 ? last.t.isk / last.t.m3 : 0;
    rate = { m3: Number(o.m3PerMin), isk: Number(o.m3PerMin) * perM3, nearM3: Number(o.m3PerMin), source: 'yours', minutes: 0 };
  }
  const left = m3 => (rate && rate.m3 > 0 ? m3 / rate.m3 : null);
  const ores = last.t.ores.map(x => {
    const was = first.t.ores.find(y => y.ore === x.ore);
    const r = list.length > 1 && mins > 0.2 && was ? Math.max(0, (was.m3 - x.m3) / mins) : null;
    return { ...x, m3PerMin: r, minutesLeft: r ? x.m3 / r : null };
  });
  // ores that were there at the first scan and are gone now
  for (const y of first.t.ores) if (!ores.find(x => x.ore === y.ore)) ores.push({ ore: y.ore, qty: 0, m3: 0, isk: 0, rocks: 0, nearM3: 0, gone: true, m3PerMin: null, minutesLeft: 0 });
  return {
    scans: list.length, since: first.at, last: last.at, total: last.t, rate,
    minutesLeft: left(last.t.m3), nearMinutesLeft: rate && rate.nearM3 > 0 ? last.t.near.m3 / rate.nearM3 : null,
    minedM3: first.t.m3 - last.t.m3, minedIsk: first.t.isk - last.t.isk, ores,
    history: list.map(x => ({ at: x.at, m3: x.t.m3, isk: x.t.isk, nearM3: x.t.near.m3 }))
  };
}

module.exports = { parse, isSurvey, totals, analyse };
