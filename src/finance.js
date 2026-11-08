// Net worth history (daily snapshots) and income analytics from wallet journals.
const store = require('./store');
const esi = require('./esi');
const { get, getAllPages, safe, ok } = esi;

const today = () => new Date().toISOString().slice(0, 10);

async function snapshot(force = false) {
  const d = store.get();
  d.history = d.history || {};
  const date = today();
  const out = [];
  for (const c of d.characters.filter(x => !x.needsReauth)) {
    const h = d.history[c.id] = d.history[c.id] || [];
    if (!force && h.length && h[h.length - 1].date === date) continue;
    const [wallet, skills, assets] = await Promise.all([
      safe(() => get(`/characters/${c.id}/wallet/`, c.id)),
      safe(() => get(`/characters/${c.id}/skills/`, c.id)),
      safe(() => esi.assets(c.id))
    ]);
    const row = { date, wallet: ok(wallet) ? wallet : null, sp: ok(skills) ? skills.total_sp : null, assets: ok(assets) ? Math.round(assets.value) : null };
    if (h.length && h[h.length - 1].date === date) h[h.length - 1] = row; else h.push(row);
    if (h.length > 800) h.splice(0, h.length - 800);
    out.push({ id: c.id, ...row });
  }
  store.save('history');
  return out;
}

function history() {
  const d = store.get();
  const h = d.history || {};
  const pilots = d.characters.map(c => ({ id: c.id, name: c.name, points: (h[c.id] || []).map(r => ({ ...r, total: (r.wallet || 0) + (r.assets || 0) })) }));
  const dates = [...new Set(pilots.flatMap(p => p.points.map(r => r.date)))].sort();
  const totals = dates.map(date => {
    let wallet = 0, assets = 0, sp = 0;
    for (const p of pilots) {
      // carry forward each pilot's latest value on or before this date
      const r = [...p.points].reverse().find(x => x.date <= date);
      if (r) { wallet += r.wallet || 0; assets += r.assets || 0; sp += r.sp || 0; }
    }
    return { date, wallet, assets, sp, total: wallet + assets };
  });
  return { pilots, totals };
}

const CATS = {
  bounty_prizes: 'Ratting bounties', ess_escrow_transfer: 'ESS payouts', agent_mission_reward: 'Missions', agent_mission_time_bonus_reward: 'Missions',
  market_transaction: 'Market trades', market_escrow: 'Market escrow', transaction_tax: 'Taxes & fees', brokers_fee: 'Taxes & fees', contract_price: 'Contracts',
  contract_reward: 'Contracts', contract_collateral: 'Contracts', contract_brokers_fee: 'Taxes & fees', contract_sales_tax: 'Taxes & fees', player_donation: 'Transfers',
  corporation_account_withdrawal: 'Transfers', player_trading: 'Transfers', planetary_import_tax: 'PI taxes', planetary_export_tax: 'PI taxes', industry_job_tax: 'Industry',
  manufacturing: 'Industry', reprocessing_tax: 'Taxes & fees', insurance: 'Insurance', jump_clone_installation_fee: 'Clones', jump_clone_activation_fee: 'Clones',
  skill_purchase: 'Skills', corporate_reward_payout: 'Corp payouts', project_discovery_reward: 'Project Discovery', daily_goal_payouts: 'Daily goals', structure_gate_jump: 'Travel'
};

async function income(charIds, days = 30) {
  const since = Date.now() - days * 86400000;
  const rows = [];
  for (const id of charIds) {
    const j = await safe(() => getAllPages(`/characters/${id}/wallet/journal/`, id, 10));
    if (ok(j)) for (const e of j) if (Date.parse(e.date) >= since && typeof e.amount === 'number') rows.push({ ...e, charId: id });
  }
  const byCat = new Map(), byDay = new Map();
  let ticks = 0, tickIsk = 0;
  for (const e of rows) {
    const cat = CATS[e.ref_type] || e.ref_type.replace(/_/g, ' ');
    const c = byCat.get(cat) || { category: cat, income: 0, expense: 0, count: 0 };
    if (e.amount >= 0) c.income += e.amount; else c.expense += e.amount;
    c.count++; byCat.set(cat, c);
    const day = e.date.slice(0, 10);
    const d = byDay.get(day) || { date: day, income: 0, expense: 0, ratting: 0 };
    if (e.amount >= 0) d.income += e.amount; else d.expense += e.amount;
    if (e.ref_type === 'bounty_prizes' || e.ref_type === 'ess_escrow_transfer') d.ratting += e.amount;
    byDay.set(day, d);
    if (e.ref_type === 'bounty_prizes') { ticks++; tickIsk += e.amount; }
  }
  const daysList = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const total = rows.reduce((n, e) => n + e.amount, 0);
  return {
    days, categories: [...byCat.values()].sort((a, b) => (b.income + b.expense) - (a.income + a.expense)), daily: daysList,
    income: rows.filter(e => e.amount > 0).reduce((n, e) => n + e.amount, 0), expense: rows.filter(e => e.amount < 0).reduce((n, e) => n + e.amount, 0), net: total,
    ratting: { ticks, isk: tickIsk, perTick: ticks ? tickIsk / ticks : 0, perHour: ticks ? tickIsk / ticks * 3 : 0 }, entries: rows.length
  };
}

module.exports = { snapshot, history, income };
