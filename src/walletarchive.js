'use strict';
/* Wallet history beyond CCP's 30 days: every time the app reads a pilot's journal or transactions it
   merges them into a local archive (by id), so income, ratting and wallet pages can look back further
   and everything can be exported as CSV. Kept for two years. */
const store = require('./store');
const { get, getAllPages, safe, ok } = require('./esi');

const KEEP = 730 * 86400000;
function book(charId) { const d = store.get(); d.walletArchive = d.walletArchive || {}; const b = d.walletArchive[charId] = d.walletArchive[charId] || { journal: {}, tx: {} }; return b; }
function merge(map, list, key) { let n = 0; for (const e of list || []) { const k = e[key]; if (k === undefined) continue; if (!map[k]) n++; map[k] = e; } return n; }
function prune(map) { const cut = Date.now() - KEEP; for (const [k, e] of Object.entries(map)) if (Date.parse(e.date) < cut) delete map[k]; }

/** Journal entries, newest first: what ESI has now plus everything kept from before. */
async function journal(charId, pages = 10) {
  const b = book(charId);
  const j = await safe(() => getAllPages(`/characters/${charId}/wallet/journal/`, charId, pages));
  if (ok(j)) { if (merge(b.journal, j, 'id')) { prune(b.journal); store.save('walletArchive'); } }
  else if (!Object.keys(b.journal).length) throw new Error(j && j.__error ? j.__error : 'Couldn’t read the wallet journal.');
  return Object.values(b.journal).sort((a, c) => c.date.localeCompare(a.date));
}
async function transactions(charId) {
  const b = book(charId);
  const t = await safe(() => get(`/characters/${charId}/wallet/transactions/`, charId));
  if (ok(t)) { if (merge(b.tx, t, 'transaction_id')) { prune(b.tx); store.save('walletArchive'); } }
  return Object.values(b.tx).sort((a, c) => c.date.localeCompare(a.date));
}
function info(charId) { const b = book(charId); const all = Object.values(b.journal); const oldest = all.reduce((m, e) => (!m || e.date < m ? e.date : m), null); return { entries: all.length, transactions: Object.keys(b.tx).length, oldest }; }

/** Rows (header first) of the journal or transactions, oldest first, for CSV export. */
async function rows(charId, kind = 'journal', names = {}) {
  if (kind === 'transactions') {
    const t = (await transactions(charId)).slice().reverse();
    return [['date', 'item', 'quantity', 'unit price', 'total', 'buy or sell', 'client', 'location'], ...t.map(x => [x.date, names[x.type_id] || x.type_id, x.quantity, x.unit_price, (x.is_buy ? -1 : 1) * x.quantity * x.unit_price, x.is_buy ? 'buy' : 'sell', names[x.client_id] || x.client_id, names[x.location_id] || x.location_id])];
  }
  const j = (await journal(charId)).slice().reverse();
  return [['date', 'type', 'amount', 'balance', 'description', 'reason', 'first party', 'second party'], ...j.map(e => [e.date, e.ref_type, e.amount, e.balance, e.description, e.reason || '', names[e.first_party_id] || e.first_party_id || '', names[e.second_party_id] || e.second_party_id || ''])];
}

module.exports = { journal, transactions, info, rows };
