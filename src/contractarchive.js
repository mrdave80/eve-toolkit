'use strict';
/* Contract history for every pilot, beyond CCP's 30 days: each time the app reads a pilot's contracts
   they're merged into a local archive, and the items in item exchanges and auctions are fetched once
   and kept with them. Search covers titles, people, places, types and item names. */
const store = require('./store');
const sde = require('./sde');

function arch() { const d = store.get(); d.contractArchive = d.contractArchive || {}; return d.contractArchive; }

/** Merge a pilot's contract list (as returned by esi.contracts, names resolved) into the archive. */
function merge(charId, list) {
  const a = arch(); let changed = false;
  for (const c of list || []) {
    const k = String(c.contract_id);
    const prev = a[k];
    const pilots = new Set((prev && prev.pilots) || []); pilots.add(Number(charId));
    a[k] = { ...(prev || {}), ...c, pilots: [...pilots], items: prev ? prev.items : undefined, seen: new Date().toISOString() };
    changed = true;
  }
  if (changed) store.save('contractArchive');
}

/** Fetch items for archived item exchanges / auctions that don't have them yet (a few per call). */
async function fillItems(get, max = 25) {
  const a = arch(); let n = 0;
  for (const c of Object.values(a)) {
    if (n >= max) break;
    if (c.items !== undefined || !['item_exchange', 'auction'].includes(c.type)) continue;
    const cid = c.pilots[0];
    try { const items = await get(`/characters/${cid}/contracts/${c.contract_id}/items/`, cid); c.items = items.map(i => [i.type_id, i.quantity, i.is_included ? 1 : 0]); }
    catch (e) { c.items = /404|403|not found/i.test(e.message || '') ? [] : undefined; }
    n++;
  }
  if (n) store.save('contractArchive');
  return n;
}

const tname = id => ((sde.ready() && sde.type(id)) || {}).name || `Type ${id}`;

/** o: { q, pilot, type, status: open|done|all, since (ISO), limit } */
function search(o = {}) {
  const chars = new Map((store.get().characters || []).map(c => [c.id, c.name]));
  const q = String(o.q || '').trim().toLowerCase();
  const words = q ? q.split(/\s+/) : [];
  let list = Object.values(arch());
  if (o.pilot) list = list.filter(c => c.pilots.includes(Number(o.pilot)));
  if (o.type) list = list.filter(c => c.type === o.type);
  if (o.status === 'open') list = list.filter(c => ['outstanding', 'in_progress'].includes(c.status));
  if (o.status === 'done') list = list.filter(c => ['finished', 'finished_issuer', 'finished_contractor'].includes(c.status));
  if (o.since) list = list.filter(c => c.date_issued >= o.since);
  const rows = [];
  for (const c of list) {
    const items = (c.items || []).map(([t, qn, inc]) => ({ typeId: t, name: tname(t), qty: qn, included: !!inc }));
    const hay = [c.title, c.type, c.status, c.issuerName, c.assigneeName, c.acceptorName, c.startName, c.endName, ...items.map(i => i.name)].filter(Boolean).join(' ').toLowerCase();
    if (words.length && !words.every(w => hay.includes(w))) continue;
    const hits = words.length ? items.filter(i => words.some(w => i.name.toLowerCase().includes(w))) : [];
    rows.push({ id: c.contract_id, type: c.type, status: c.status, title: c.title || '', issued: c.date_issued, completed: c.date_completed || null, price: c.price || 0, reward: c.reward || 0, collateral: c.collateral || 0, volume: c.volume || 0,
      issuer: c.issuerName, assignee: c.assigneeName, acceptor: c.acceptorName, start: c.startName, end: c.endName, pilots: c.pilots.map(id => chars.get(id) || id), items, itemHits: hits, itemsKnown: c.items !== undefined });
  }
  rows.sort((a, b) => String(b.issued).localeCompare(String(a.issued)));
  const all = Object.values(arch());
  const oldest = all.reduce((m, c) => (!m || c.date_issued < m ? c.date_issued : m), null);
  return { rows: rows.slice(0, Number(o.limit) || 300), matched: rows.length, total: all.length, oldest, pendingItems: all.filter(c => c.items === undefined && ['item_exchange', 'auction'].includes(c.type)).length };
}

module.exports = { merge, fillItems, search };
