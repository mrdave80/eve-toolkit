'use strict';
/* Alliance jump bridges (Ansiblex): pasted in from alliance tools or structure names like "1DQ1-A » 8QT-H4 - Bridge". */
const store = require('./store');
const sde = require('./sde');

const list = () => store.get().jumpBridges || [];

/** Finds system names in a line. Hyphens stay inside names (1DQ1-A); separators are », arrows, tabs, commas, " - " and spaces. */
function systemsIn(line) {
  const tokens = line.replace(/[«»⇄↔→←]|<->|<=>|->|<-|=>|\|/g, ' ').replace(/\s-\s/g, ' ').split(/[\s,;\t]+/).filter(Boolean);
  const found = [];
  for (let i = 0; i < tokens.length && found.length < 2; i++) {
    // try two-word names first (e.g. "Sarum Prime"), then single tokens
    const two = i + 1 < tokens.length ? sde.systemIdByName(tokens[i] + ' ' + tokens[i + 1]) : null;
    if (two) { if (!found.includes(two)) found.push(two); i++; continue; }
    const one = sde.systemIdByName(tokens[i].replace(/[()[\]]/g, ''));
    if (one && !found.includes(one)) found.push(one);
  }
  return found;
}

function parse(text) {
  if (!sde.ready()) throw new Error('Download the game data first (Settings → Game data).');
  const out = [], skipped = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const s = systemsIn(line);
    if (s.length === 2) out.push({ a: s[0], b: s[1], aName: sde.system(s[0]).name, bName: sde.system(s[1]).name });
    else skipped.push(line.slice(0, 80));
  }
  return { bridges: out, skipped };
}

function save(bridges, mode = 'replace') {
  const cur = mode === 'add' ? list() : [];
  const key = x => [x.a, x.b].sort().join('-');
  const m = new Map(cur.map(x => [key(x), x]));
  for (const b of bridges) if (b && Number.isInteger(b.a) && Number.isInteger(b.b) && b.a !== b.b) m.set(key(b), { a: b.a, b: b.b, aName: b.aName, bName: b.bName });
  store.get().jumpBridges = [...m.values()].slice(0, 500);
  store.save();
  return list();
}

module.exports = { list, parse, save, systemsIn };
