'use strict';
/* Watches the clipboard for a copied Local member list or d-scan and analyses it automatically.
 * Nothing is stored or sent anywhere except the ESI and zKillboard lookups needed to grade pilots. */
const { clipboard } = require('electron');
const sde = require('./sde');

let timer = null, last = '', busy = false, ignore = new Set(), handler = null;

const NAME = /^[A-Za-z0-9][A-Za-z0-9 .'_-]{1,36}$/;
const DIST = /^(-|[\d,.\s  ]+\s?(m|km|AU))$/i;

function classify(text) {
  if (!text || text.length > 60000) return null;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  // Probe scanner: rows start with a signature id like ABC-123
  if (lines.filter(l => /^[A-Z]{3}-\d{3}\t/.test(l)).length >= lines.length * 0.8) return 'probe';
  // D-scan: tab-separated rows whose last column is a distance
  const tabbed = lines.filter(l => l.includes('\t'));
  if (tabbed.length && tabbed.length >= lines.length * 0.8 && tabbed.some(l => DIST.test(l.split('\t').pop().trim()))) return 'dscan';
  // Local: 2+ lines, every line a plausible pilot name, not mostly system names
  if (lines.length >= 2 && lines.length <= 1000 && !tabbed.length && lines.every(l => NAME.test(l) && /[a-z]/i.test(l))) {
    if (sde.ready()) {
      const sys = lines.filter(l => sde.systemIdByName(l)).length;
      const items = lines.filter(l => sde.typeIdByName(l)).length;
      if (sys > lines.length / 2 || items > lines.length / 2) return null;
    }
    return 'local';
  }
  return null;
}

function tick() {
  if (busy) return;
  let text = '';
  try { text = clipboard.readText(); } catch { return; }
  if (text === last) return;
  last = text;
  if (ignore.has(text)) { ignore.delete(text); return; }
  const kind = classify(text);
  if (!kind || !handler) return;
  busy = true;
  Promise.resolve(handler(kind, text)).catch(() => {}).finally(() => { busy = false; });
}

function start(fn) {
  handler = fn;
  stop();
  try { last = clipboard.readText(); } catch { last = ''; } // don't analyse whatever was already on the clipboard
  timer = setInterval(tick, 800);
}
function stop() { clearInterval(timer); timer = null; }

module.exports = { start, stop, classify, ignoreText: t => { ignore.add(String(t)); if (ignore.size > 20) ignore = new Set([...ignore].slice(-10)); }, running: () => !!timer };
