'use strict';
/* Skill farm calculator and insurance check. */
const store = require('./store');
const esi = require('./esi');
const market = require('./market');
const sde = require('./sde');

const PLEX = 44992;
const IDS = { lsi: 40520, extractor: 40519 };
const EXTRACT_SP = 500000;
const MIN_SP = 5500000;     // an extractor needs the pilot above 5.5m SP
const DAY_H = 24, MONTH_H = 30 * 24;

const FARM_DEFAULTS = { omegaPlex: 500, mctPlex: 350, salesTax: 3.37, brokerFee: 1.5, sellMode: 'buy', slots: {} };
const farmCfg = () => { const s = store.get().settings.farm || {}; return { ...FARM_DEFAULTS, ...s, slots: { ...(s.slots || {}) } }; };

function saveFarm(next = {}) {
  const cur = farmCfg(); const d = store.get();
  const num = (v, lo, hi, dflt) => { const n = Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
  const out = { ...cur };
  if (next.omegaPlex !== undefined) out.omegaPlex = num(next.omegaPlex, 0, 10000, cur.omegaPlex);
  if (next.mctPlex !== undefined) out.mctPlex = num(next.mctPlex, 0, 10000, cur.mctPlex);
  if (next.salesTax !== undefined) out.salesTax = num(next.salesTax, 0, 20, cur.salesTax);
  if (next.brokerFee !== undefined) out.brokerFee = num(next.brokerFee, 0, 20, cur.brokerFee);
  if (next.sellMode === 'buy' || next.sellMode === 'sell') out.sellMode = next.sellMode;
  if (next.slots && typeof next.slots === 'object') for (const [id, v] of Object.entries(next.slots)) if (['omega', 'mct', 'paid', 'skip'].includes(v)) out.slots[Number(id)] = v;
  d.settings.farm = out; store.save();
  return out;
}

const spPerHour = t => {
  if (!t || !t.start || !t.finish) return 0;
  const hrs = (Date.parse(t.finish) - Date.parse(t.start)) / 3.6e6;
  const sp = (t.levelEndSp || 0) - (t.trainingStartSp ?? t.levelStartSp ?? 0);
  return hrs > 0 && sp > 0 ? sp / hrs : 0;
};

async function farm() {
  const c = farmCfg(); const d = store.get();
  const lsi = sde.ready() ? (sde.typeIdByName('Large Skill Injector') || IDS.lsi) : IDS.lsi;
  const ext = sde.ready() ? (sde.typeIdByName('Skill Extractor') || IDS.extractor) : IDS.extractor;
  const [prices, overviews] = await Promise.all([
    market.prices([PLEX, lsi, ext], 'Jita'),
    Promise.all((d.characters || []).map(ch => esi.safe(() => esi.overview(ch.id))))
  ]);
  const P = id => prices[id] || {};
  const plex = P(PLEX).sell ?? P(PLEX).avg ?? 0;
  const lsiGross = c.sellMode === 'buy' ? (P(lsi).buy ?? 0) : (P(lsi).sell ?? P(lsi).avg ?? 0);
  const fees = (c.salesTax + (c.sellMode === 'sell' ? c.brokerFee : 0)) / 100;
  const lsiNet = lsiGross * (1 - fees);
  const extCost = P(ext).sell ?? P(ext).avg ?? 0;
  const perExtraction = lsiNet - extCost;

  const pilots = overviews.map((o, i) => {
    const ch = d.characters[i];
    if (!esi.ok(o)) return { id: ch.id, name: ch.name, error: o.__error || 'Could not load' };
    const rate = spPerHour(o.training);
    const slot = c.slots[ch.id] || 'omega';
    const spMonth = rate * MONTH_H;
    const extractions = spMonth / EXTRACT_SP;
    const plexCost = slot === 'omega' ? c.omegaPlex : slot === 'mct' ? c.mctPlex : 0;
    const costIsk = plexCost * plex;
    const revenue = slot === 'skip' ? 0 : extractions * perExtraction;
    const extractable = Math.max(0, Math.floor(((o.totalSp || 0) - MIN_SP) / EXTRACT_SP) + 1);
    return {
      id: ch.id, name: o.name || ch.name, totalSp: o.totalSp, spPerHour: rate, spPerDay: rate * DAY_H, spMonth, extractions,
      training: o.training ? o.training.skill : null, slot, plexCost, costIsk: slot === 'skip' ? 0 : costIsk,
      revenue, profit: slot === 'skip' ? 0 : revenue - costIsk,
      aboveMin: (o.totalSp || 0) >= MIN_SP, extractable
    };
  });
  const live = pilots.filter(p => !p.error && p.slot !== 'skip');
  return {
    cfg: c, prices: { plex, lsiGross, lsiNet, extCost, perExtraction, fees, plexGlobal: true },
    pilots,
    totals: { revenue: live.reduce((n, p) => n + p.revenue, 0), cost: live.reduce((n, p) => n + p.costIsk, 0), profit: live.reduce((n, p) => n + p.profit, 0), extractions: live.reduce((n, p) => n + p.extractions, 0) }
  };
}

// ---------- Insurance ----------
let insCache = { at: 0, map: null };
async function insurancePrices() {
  if (insCache.map && Date.now() - insCache.at < 6 * 3600000) return insCache.map;
  const list = await esi.get('/insurance/prices/');
  insCache = { at: Date.now(), map: new Map(list.map(x => [x.type_id, x.levels])) };
  return insCache.map;
}

/** Insurance options for the pilots' current ships, plus any ship names given. */
async function insurance(extraNames = []) {
  const d = store.get();
  const [ins, overviews] = await Promise.all([insurancePrices(), Promise.all((d.characters || []).map(ch => esi.safe(() => esi.overview(ch.id))))]);
  const ships = [];
  overviews.forEach((o, i) => { if (esi.ok(o) && o.ship && o.ship.typeId) ships.push({ pilot: o.name || d.characters[i].name, typeId: o.ship.typeId, type: o.ship.type, shipName: o.ship.name }); });
  const unknown = [];
  for (const n of extraNames.map(s => String(s).trim()).filter(Boolean).slice(0, 20)) {
    const id = sde.ready() ? sde.typeIdByName(n) : null;
    if (id) ships.push({ pilot: null, typeId: id, type: (sde.type(id) || {}).name || n }); else unknown.push(n);
  }
  const prices = await market.prices(ships.map(s => s.typeId), 'Jita');
  const rows = ships.map(s => {
    const levels = ins.get(s.typeId) || [];
    const p = prices[s.typeId] || {};
    const hull = p.sell ?? p.avg ?? 0;
    const opts = levels.map(l => ({ name: l.name, cost: l.cost, payout: l.payout, net: l.payout - l.cost, lossInsured: hull - (l.payout - l.cost) }))
      .sort((a, b) => a.cost - b.cost);
    const best = opts.reduce((b, o) => (!b || o.net > b.net ? o : b), null);
    const platinum = opts.find(o => /platinum/i.test(o.name)) || opts[opts.length - 1] || null;
    return { ...s, hull, insurable: opts.length > 0, levels: opts, platinum, coverPct: platinum && hull ? platinum.net / hull : null,
      verdict: !opts.length ? 'Not insurable' : !platinum || platinum.net <= 0 ? 'Not worth it' : platinum.net / Math.max(1, hull) >= 0.4 ? 'Worth it' : 'Marginal' };
  });
  return { rows, unknown };
}

module.exports = { farm, saveFarm, insurance, _t: { spPerHour } };
