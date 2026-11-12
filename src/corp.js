// Corporation / alliance ESI loaders. Every call uses a "director" pilot's
// token: a pilot logged in with corp scopes and holding the in-game roles ESI
// requires (Director for most, Accountant for wallets, Station Manager for
// structures, etc.). Missing roles come back as 403 and are reported per section.
const store = require('./store');
const { get, getAllPages, safe, ok, resolveNames, marketPrices } = require('./esi');

const DAY = 86400000;
const corpIdCache = new Map();

async function corpOf(directorId) {
  if (corpIdCache.has(directorId)) return corpIdCache.get(directorId);
  const c = await get(`/characters/${directorId}/`);
  const info = { corporationId: c.corporation_id, allianceId: c.alliance_id || null };
  corpIdCache.set(directorId, info);
  return info;
}

const roleHint = (r, need) => r && r.__status === 403 ? `Needs the in-game ${need} role on this pilot.` : (r && r.__error) || null;

// ---------- Overview ----------

async function overview(directorId) {
  const { corporationId, allianceId } = await corpOf(directorId);
  const [corp, alliance, allianceCorps, wallets, members, structures] = await Promise.all([
    get(`/corporations/${corporationId}/`),
    allianceId ? safe(() => get(`/alliances/${allianceId}/`)) : null,
    allianceId ? safe(() => get(`/alliances/${allianceId}/corporations/`)) : null,
    safe(() => get(`/corporations/${corporationId}/wallets/`, directorId)),
    safe(() => get(`/corporations/${corporationId}/members/`, directorId)),
    safe(() => getAllPages(`/corporations/${corporationId}/structures/`, directorId, 5))
  ]);
  const names = await resolveNames([corp.ceo_id, corp.home_station_id, allianceId, ...(ok(allianceCorps) ? allianceCorps : [])].filter(Boolean), directorId);
  const now = Date.now();
  const st = ok(structures) ? structures : [];
  return {
    corporationId, allianceId,
    name: corp.name, ticker: corp.ticker, memberCount: corp.member_count, taxRate: corp.tax_rate,
    ceo: names[corp.ceo_id], home: corp.home_station_id ? names[corp.home_station_id] : null, founded: corp.date_founded || null,
    alliance: alliance && ok(alliance) ? { name: alliance.name, ticker: alliance.ticker, corps: ok(allianceCorps) ? allianceCorps.length : null } : null,
    allianceCorps: ok(allianceCorps) ? allianceCorps.map(id => ({ id, name: names[id] })) : [],
    walletTotal: ok(wallets) ? wallets.reduce((n, w) => n + w.balance, 0) : null,
    walletError: roleHint(wallets, 'Accountant or Junior Accountant'),
    memberIds: ok(members) ? members.length : null,
    structures: {
      count: st.length,
      lowFuel: st.filter(s => s.fuel_expires && Date.parse(s.fuel_expires) - now < 7 * DAY).length,
      noFuel: st.filter(s => !s.fuel_expires).length,
      reinforced: st.filter(s => /reinforce|armor|hull/.test(s.state || '')).length
    },
    structuresError: roleHint(structures, 'Station Manager')
  };
}

// ---------- Members ----------

async function members(directorId) {
  const { corporationId } = await corpOf(directorId);
  const [ids, tracking, roles, titles, memberTitles, limit] = await Promise.all([
    get(`/corporations/${corporationId}/members/`, directorId),
    safe(() => get(`/corporations/${corporationId}/membertracking/`, directorId)),
    safe(() => get(`/corporations/${corporationId}/roles/`, directorId)),
    safe(() => get(`/corporations/${corporationId}/titles/`, directorId)),
    safe(() => get(`/corporations/${corporationId}/members/titles/`, directorId)),
    safe(() => get(`/corporations/${corporationId}/members/limit/`, directorId))
  ]);
  const track = new Map((ok(tracking) ? tracking : []).map(t => [t.character_id, t]));
  const roleMap = new Map((ok(roles) ? roles : []).map(r => [r.character_id, r.roles || []]));
  const titleNames = new Map((ok(titles) ? titles : []).map(t => [t.title_id, String(t.name || '').replace(/<[^>]+>/g, '')]));
  const mTitles = new Map((ok(memberTitles) ? memberTitles : []).map(t => [t.character_id, (t.titles || []).map(x => titleNames.get(x)).filter(Boolean)]));
  const extra = [];
  for (const t of track.values()) extra.push(t.location_id, t.ship_type_id);
  const names = await resolveNames([...ids, ...extra.filter(x => x && x < 1e12)], directorId);
  const ws = require('./workspace').get();
  const now = Date.now();
  const list = ids.map(id => {
    const t = track.get(id);
    const audit = ws.audits[id];
    const local = store.get().characters.find(c => c.id === id);
    return {
      id, name: names[id],
      lastLogon: t ? t.logon_date || null : null,
      lastLogoff: t ? t.logoff_date || null : null,
      joined: t ? t.start_date || null : null,
      location: t && t.location_id ? (names[t.location_id] || (t.location_id >= 1e12 ? 'Structure' : null)) : null,
      ship: t && t.ship_type_id ? names[t.ship_type_id] : null,
      shipTypeId: t ? t.ship_type_id || null : null,
      roles: roleMap.get(id) || [],
      titles: mTitles.get(id) || [],
      audit: local ? { source: 'live', at: now } : (audit ? { source: 'import', at: audit.exportedAt } : null),
      discord: ws.discord.links[id] || null,
      inactiveDays: t && t.logoff_date ? Math.floor((now - Date.parse(t.logoff_date)) / DAY) : null
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return {
    corporationId,
    limit: ok(limit) ? limit : null,
    trackingError: roleHint(tracking, 'Director'),
    rolesError: roleHint(roles, 'Director'),
    list
  };
}

// ---------- Structures ----------

async function structures(directorId) {
  const { corporationId } = await corpOf(directorId);
  const [st, pos, poco] = await Promise.all([
    safe(() => getAllPages(`/corporations/${corporationId}/structures/`, directorId, 10)),
    safe(() => get(`/corporations/${corporationId}/starbases/`, directorId)),
    safe(() => getAllPages(`/corporations/${corporationId}/customs_offices/`, directorId, 10))
  ]);
  const s = ok(st) ? st : [], p = ok(pos) ? pos : [], c = ok(poco) ? poco : [];
  const names = await resolveNames([
    ...s.flatMap(x => [x.type_id, x.system_id]), ...p.flatMap(x => [x.type_id, x.system_id, x.moon_id]), ...c.map(x => x.system_id)
  ].filter(Boolean), directorId);
  const now = Date.now();
  return {
    error: roleHint(st, 'Station Manager'),
    structures: s.map(x => ({
      id: x.structure_id, name: x.name || `Structure ${x.structure_id}`, type: names[x.type_id], typeId: x.type_id,
      system: names[x.system_id], state: x.state, stateTimerEnd: x.state_timer_end || null,
      fuelExpires: x.fuel_expires || null,
      fuelDays: x.fuel_expires ? (Date.parse(x.fuel_expires) - now) / DAY : null,
      reinforceHour: x.reinforce_hour ?? null, unanchorsAt: x.unanchors_at || null,
      services: (x.services || []).map(v => ({ name: v.name, state: v.state }))
    })).sort((a, b) => (a.fuelDays ?? -1) - (b.fuelDays ?? -1)),
    starbases: p.map(x => ({
      id: x.starbase_id, type: names[x.type_id], typeId: x.type_id, system: names[x.system_id], moon: x.moon_id ? names[x.moon_id] : null,
      state: x.state || 'unknown', reinforcedUntil: x.reinforced_until || null, onlinedSince: x.onlined_since || null
    })),
    starbaseError: roleHint(pos, 'Director'),
    customsOffices: c.map(x => ({
      id: x.office_id, system: names[x.system_id], reinforceExit: `${x.reinforce_exit_start}:00–${x.reinforce_exit_end}:00`,
      allowAlliance: x.allow_alliance_access, standingLevel: x.standing_level || null,
      taxCorp: x.corporation_tax_rate ?? null, taxAlliance: x.alliance_tax_rate ?? null
    })),
    customsError: roleHint(poco, 'Director')
  };
}

// ---------- Moons ----------

async function moons(directorId) {
  const { corporationId } = await corpOf(directorId);
  const [ex, obs] = await Promise.all([
    safe(() => getAllPages(`/corporation/${corporationId}/mining/extractions/`, directorId, 5)),
    safe(() => getAllPages(`/corporation/${corporationId}/mining/observers/`, directorId, 5))
  ]);
  const extractions = ok(ex) ? ex : [];
  const observers = ok(obs) ? obs : [];
  // Ledger for the 10 most recently updated observers
  const recent = [...observers].sort((a, b) => b.last_updated.localeCompare(a.last_updated)).slice(0, 10);
  const ledgers = await Promise.all(recent.map(async o => {
    const r = await safe(() => getAllPages(`/corporation/${corporationId}/mining/observers/${o.observer_id}/`, directorId, 10));
    return { observerId: o.observer_id, rows: ok(r) ? r : [] };
  }));
  const rows = ledgers.flatMap(l => l.rows.map(r => ({ ...r, observerId: l.observerId })));
  const prices = await marketPrices();
  const names = await resolveNames([
    ...extractions.map(e => e.moon_id), ...rows.flatMap(r => [r.character_id, r.type_id, r.recorded_corporation_id])
  ].filter(Boolean), directorId);
  const structNames = await resolveNames([...new Set([...extractions.map(e => e.structure_id), ...observers.map(o => o.observer_id)])], directorId);
  const byPilot = new Map();
  for (const r of rows) {
    const v = (prices.get(r.type_id) || 0) * r.quantity;
    const p = byPilot.get(r.character_id) || { id: r.character_id, name: names[r.character_id], corp: names[r.recorded_corporation_id], quantity: 0, value: 0 };
    p.quantity += r.quantity; p.value += v;
    byPilot.set(r.character_id, p);
  }
  const now = Date.now();
  return {
    error: roleHint(ex, 'Station Manager'),
    observerError: roleHint(obs, 'Accountant'),
    extractions: extractions.map(e => ({
      structure: structNames[e.structure_id], structureId: e.structure_id, moon: names[e.moon_id],
      start: e.extraction_start_time, arrival: e.chunk_arrival_time, decay: e.natural_decay_time,
      ready: Date.parse(e.chunk_arrival_time) <= now
    })).sort((a, b) => a.arrival.localeCompare(b.arrival)),
    observers: observers.map(o => ({ id: o.observer_id, name: structNames[o.observer_id], updated: o.last_updated })),
    miners: [...byPilot.values()].sort((a, b) => b.value - a.value),
    ledgerTotal: [...byPilot.values()].reduce((n, p) => n + p.value, 0)
  };
}

/** Just the moon extractions (light enough for background alerts). */
async function extractions(directorId) {
  const { corporationId } = await corpOf(directorId);
  const ex = await getAllPages(`/corporation/${corporationId}/mining/extractions/`, directorId, 5);
  const names = await resolveNames([...new Set(ex.flatMap(e => [e.moon_id, e.structure_id]))], directorId);
  return ex.map(e => ({ structureId: e.structure_id, structure: names[e.structure_id], moonId: e.moon_id, moon: names[e.moon_id], arrival: e.chunk_arrival_time, decay: e.natural_decay_time, start: e.extraction_start_time }))
    .sort((a, b) => a.arrival.localeCompare(b.arrival));
}

// ---------- Finance ----------

async function wallets(directorId, division = 1) {
  const { corporationId } = await corpOf(directorId);
  const [w, div, journal] = await Promise.all([
    get(`/corporations/${corporationId}/wallets/`, directorId),
    safe(() => get(`/corporations/${corporationId}/divisions/`, directorId)),
    safe(() => getAllPages(`/corporations/${corporationId}/wallets/${division}/journal/`, directorId, 5))
  ]);
  const divNames = new Map((ok(div) ? div.wallet || [] : []).map(d => [d.division, d.name]));
  const j = ok(journal) ? journal : [];
  const names = await resolveNames([...new Set(j.flatMap(x => [x.first_party_id, x.second_party_id]).filter(Boolean))], directorId);
  return {
    divisions: w.map(x => ({ division: x.division, name: divNames.get(x.division) || (x.division === 1 ? 'Master Wallet' : `Division ${x.division}`), balance: x.balance })),
    total: w.reduce((n, x) => n + x.balance, 0),
    division,
    journal: j.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500).map(x => ({
      ...x, firstParty: names[x.first_party_id], secondParty: names[x.second_party_id]
    })),
    journalError: ok(journal) ? null : journal.__error
  };
}

async function contracts(directorId) {
  const { corporationId } = await corpOf(directorId);
  const list = await getAllPages(`/corporations/${corporationId}/contracts/`, directorId, 10);
  const names = await resolveNames(list.flatMap(c => [c.issuer_id, c.assignee_id, c.acceptor_id, c.start_location_id, c.end_location_id]).filter(x => x && x !== 0), directorId);
  return list.sort((a, b) => b.date_issued.localeCompare(a.date_issued)).map(c => ({
    ...c, issuerName: names[c.issuer_id], assigneeName: c.assignee_id ? names[c.assignee_id] : null,
    acceptorName: c.acceptor_id ? names[c.acceptor_id] : null, startName: names[c.start_location_id], endName: c.end_location_id ? names[c.end_location_id] : null
  }));
}

async function orders(directorId) {
  const { corporationId } = await corpOf(directorId);
  const list = await getAllPages(`/corporations/${corporationId}/orders/`, directorId, 5);
  const names = await resolveNames(list.flatMap(o => [o.type_id, o.location_id, o.issued_by]), directorId);
  return list.map(o => ({ ...o, typeName: names[o.type_id], locationName: names[o.location_id], issuedBy: names[o.issued_by] }));
}

// ---------- Industry / assets ----------

const ACT = { 1: ['Manufacturing', 'manufacturing'], 3: ['TE Research', 'science'], 4: ['ME Research', 'science'], 5: ['Copying', 'science'], 7: ['Reverse Engineering', 'science'], 8: ['Invention', 'science'], 9: ['Reactions', 'reaction'], 11: ['Reactions', 'reaction'] };

async function industry(directorId) {
  const { corporationId } = await corpOf(directorId);
  const jobs = await getAllPages(`/corporations/${corporationId}/industry/jobs/?include_completed=true`, directorId, 10);
  const [names, prices] = await Promise.all([
    resolveNames(jobs.flatMap(j => [j.blueprint_type_id, j.product_type_id, j.installer_id, j.facility_id]).filter(Boolean), directorId),
    marketPrices()
  ]);
  const now = Date.now();
  return jobs.map(j => {
    const [activity, slot] = ACT[j.activity_id] || [`Activity ${j.activity_id}`, 'science'];
    const end = Date.parse(j.end_date), start = Date.parse(j.start_date);
    return {
      jobId: j.job_id, corp: true, activity, slot,
      status: j.status === 'ready' || (j.status === 'active' && end <= now) ? 'ready' : j.status,
      blueprintTypeId: j.blueprint_type_id, blueprint: names[j.blueprint_type_id],
      productTypeId: j.product_type_id || null, product: j.product_type_id ? names[j.product_type_id] : null,
      runs: j.runs, successfulRuns: j.successful_runs ?? null, probability: j.probability ?? null,
      facility: names[j.facility_id] || `Facility ${j.facility_id}`, installer: names[j.installer_id], pilot: names[j.installer_id],
      start: j.start_date, end: j.end_date, completed: j.completed_date || null,
      progress: Math.max(0, Math.min(1, (now - start) / (end - start))),
      outputValue: [1, 9, 11].includes(j.activity_id) && j.product_type_id ? (prices.get(j.product_type_id) || 0) * j.runs : null
    };
  }).sort((a, b) => {
    const r = s => ({ ready: 0, active: 1, paused: 2 }[s] ?? 3);
    return r(a.status) - r(b.status) || (r(a.status) <= 2 ? a.end.localeCompare(b.end) : b.end.localeCompare(a.end));
  });
}

async function assets(directorId) {
  const { corporationId } = await corpOf(directorId);
  const [list, bps, div] = await Promise.all([
    getAllPages(`/corporations/${corporationId}/assets/`, directorId, 40),
    safe(() => getAllPages(`/corporations/${corporationId}/blueprints/`, directorId, 20)),
    safe(() => get(`/corporations/${corporationId}/divisions/`, directorId))
  ]);
  const byItem = new Map(list.map(a => [a.item_id, a]));
  const rootOf = a => { let cur = a, g = 0; while (byItem.has(cur.location_id) && g++ < 10) cur = byItem.get(cur.location_id); return cur; };
  const hangarNames = new Map((ok(div) ? div.hangar || [] : []).map(h => [h.division, h.name]));
  const divisionOf = flag => { const m = /CorpSAG(\d)/.exec(flag || ''); return m ? Number(m[1]) : null; };
  const prices = await marketPrices();
  const groups = new Map();
  for (const a of list) {
    const root = rootOf(a);
    const loc = root.location_id;
    if (!groups.has(loc)) groups.set(loc, { items: new Map(), value: 0, count: 0 });
    const g = groups.get(loc);
    const unit = a.is_blueprint_copy ? 0 : (prices.get(a.type_id) || 0);
    const d = divisionOf(a.location_flag) || divisionOf(root.location_flag);
    const key = a.type_id + ':' + (d || 0);
    const cur = g.items.get(key) || { typeId: a.type_id, quantity: 0, value: 0, division: d };
    cur.quantity += a.quantity; cur.value += unit * a.quantity;
    g.items.set(key, cur); g.value += unit * a.quantity; g.count++;
  }
  const typeIds = [...new Set(list.map(a => a.type_id))];
  const locIds = [...groups.keys()].filter(id => (id >= 60000000 && id < 64000000) || id >= 1e12 || (id >= 30000000 && id < 33000000));
  const names = await resolveNames([...typeIds, ...locIds], directorId);
  const bp = ok(bps) ? bps : [];
  const bpNames = await resolveNames([...new Set(bp.map(b => b.type_id))], directorId);
  const locations = [...groups.entries()].map(([id, g]) => ({
    id, name: names[id] || `Location ${id}`, value: g.value, itemCount: g.count,
    items: [...g.items.values()].map(i => ({ ...i, name: names[i.typeId], unitPrice: i.quantity ? i.value / i.quantity : 0, divisionName: i.division ? (hangarNames.get(i.division) || `Hangar ${i.division}`) : null }))
      .sort((a, b) => b.value - a.value)
  })).sort((a, b) => b.value - a.value);
  return {
    total: list.length, value: locations.reduce((n, l) => n + l.value, 0), locations,
    blueprints: bp.map(b => ({
      typeId: b.type_id, name: bpNames[b.type_id], me: b.material_efficiency, te: b.time_efficiency,
      original: b.quantity === -1 || b.runs === -1, runs: b.runs, quantity: b.quantity > 0 ? b.quantity : 1,
      value: (b.quantity === -1 || b.runs === -1) ? (prices.get(b.type_id) || 0) : 0,
      location: b.location_flag && b.location_flag.startsWith('CorpSAG') ? (hangarNames.get(divisionOf(b.location_flag)) || b.location_flag) : (b.location_flag || '')
    })).sort((a, b) => a.name.localeCompare(b.name)),
    blueprintError: roleHint(bps, 'Director')
  };
}

// ---------- Killboard ----------

const kmCache = new Map();
async function killmails(directorId, limit = 80) {
  const { corporationId } = await corpOf(directorId);
  const list = (await get(`/corporations/${corporationId}/killmails/recent/`, directorId)).slice(0, limit);
  const kms = [];
  for (let i = 0; i < list.length; i += 10) {
    const batch = await Promise.all(list.slice(i, i + 10).map(async k => {
      if (kmCache.has(k.killmail_id)) return kmCache.get(k.killmail_id);
      const r = await safe(() => get(`/killmails/${k.killmail_id}/${k.killmail_hash}/`));
      if (ok(r)) { r.__hash = k.killmail_hash; kmCache.set(k.killmail_id, r); return r; }
      return null;
    }));
    kms.push(...batch.filter(Boolean));
  }
  return summariseKillmails(kms, corporationId, directorId);
}

async function summariseKillmails(kms, corporationId, directorId) {
  const ids = new Set();
  for (const k of kms) {
    [k.solar_system_id, k.victim.ship_type_id, k.victim.character_id, k.victim.corporation_id].forEach(x => x && ids.add(x));
    const fb = k.attackers.find(a => a.final_blow);
    if (fb) [fb.character_id, fb.ship_type_id, fb.corporation_id].forEach(x => x && ids.add(x));
  }
  const [names, prices] = await Promise.all([resolveNames([...ids], directorId), marketPrices()]);
  return kms.map(k => {
    const fb = k.attackers.find(a => a.final_blow) || {};
    const fitted = (k.victim.items || []).reduce((n, i) => n + (prices.get(i.item_type_id) || 0) * ((i.quantity_destroyed || 0) + (i.quantity_dropped || 0)), 0);
    const hull = prices.get(k.victim.ship_type_id) || 0;
    return {
      id: k.killmail_id, hash: k.__hash || null, time: k.killmail_time,
      loss: k.victim.corporation_id === corporationId,
      system: names[k.solar_system_id], victimId: k.victim.character_id || null,
      victim: names[k.victim.character_id] || names[k.victim.corporation_id] || 'Structure',
      victimCorp: names[k.victim.corporation_id],
      ship: names[k.victim.ship_type_id], shipTypeId: k.victim.ship_type_id,
      hullValue: hull, fittedValue: fitted, totalValue: hull + fitted,
      attackers: k.attackers.length, finalBlow: names[fb.character_id] || (fb.faction_id ? 'NPC' : '—'),
      finalBlowShip: fb.ship_type_id ? names[fb.ship_type_id] : null,
      corpAttackers: k.attackers.filter(a => a.corporation_id === corporationId).length
    };
  }).sort((a, b) => b.time.localeCompare(a.time));
}

async function killmailByLink(link, directorId) {
  const m = /killmails\/(\d+)\/([0-9a-f]{40})/i.exec(link) || /kill\/(\d+)/.exec(link);
  if (!m) throw new Error('Paste an ESI killmail link (from in-game "Copy External Kill Link"), e.g. https://esi.evetech.net/latest/killmails/123/abc…/');
  if (!m[2]) throw new Error('zKillboard links don\'t include the killmail hash. In game, right-click the loss mail → "Copy External Kill Link" and paste that instead.');
  const k = await get(`/killmails/${m[1]}/${m[2]}/`);
  k.__hash = m[2];
  const { corporationId } = directorId ? await corpOf(directorId) : { corporationId: null };
  return (await summariseKillmails([k], corporationId, directorId))[0];
}

// ---------- Structure notifications → timers ----------

const TIMER_TYPES = ['StructureLostShields', 'StructureLostArmor', 'StructureAnchoring', 'StructureUnanchoring', 'OrbitalReinforced', 'TowerAlertMsg', 'SovStructureReinforced', 'MoonminingExtractionStarted'];
const ALERT_TYPES = ['StructureUnderAttack', 'StructureLostShields', 'StructureLostArmor', 'StructureDestroyed', 'StructureFuelAlert', 'StructureServicesOffline', 'StructureLowReagentsAlert', 'OrbitalAttacked', 'TowerAlertMsg', 'TowerResourceAlertMsg', 'MoonminingExtractionFinished', 'MoonminingAutomaticFracture', 'StructureWentLowPower', 'StructureWentHighPower'];

function yamlVal(text, key) {
  const m = new RegExp('^\\s*' + key + ':\\s*(.+)$', 'm').exec(text || '');
  return m ? m[1].trim() : null;
}

async function structureNotifications(directorId) {
  const list = await get(`/characters/${directorId}/notifications/`, directorId);
  const rel = list.filter(n => TIMER_TYPES.includes(n.type) || ALERT_TYPES.includes(n.type));
  const sysIds = rel.map(n => Number(yamlVal(n.text, 'solarsystemID') || yamlVal(n.text, 'solarSystemID') || 0)).filter(Boolean);
  const typeIds = rel.map(n => Number(yamlVal(n.text, 'structureTypeID') || yamlVal(n.text, 'typeID') || 0)).filter(Boolean);
  const names = await resolveNames([...sysIds, ...typeIds], directorId);
  return rel.map(n => {
    const sys = Number(yamlVal(n.text, 'solarsystemID') || yamlVal(n.text, 'solarSystemID') || 0);
    const typeId = Number(yamlVal(n.text, 'structureTypeID') || yamlVal(n.text, 'typeID') || 0);
    const timeLeft = Number(yamlVal(n.text, 'timeLeft') || 0);          // 100ns ticks
    const timerEnd = timeLeft ? new Date(Date.parse(n.timestamp) + timeLeft / 10000).toISOString() : null;
    return {
      id: n.notification_id, type: n.type, typeLabel: n.type.replace(/([a-z])([A-Z])/g, '$1 $2'),
      timestamp: n.timestamp, system: sys ? names[sys] : null, structureType: typeId ? names[typeId] : null,
      structureId: Number(yamlVal(n.text, 'structureID') || 0) || null,
      timerEnd, canTimer: TIMER_TYPES.includes(n.type) && !!timerEnd, alert: ALERT_TYPES.includes(n.type),
      text: n.text || ''
    };
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ---------- Fleet (for FAT tracker) ----------

async function currentFleet(fcId) {
  const f = await safe(() => get(`/characters/${fcId}/fleet/`, fcId));
  if (!ok(f)) return { inFleet: false, error: f.__status === 404 ? null : f.__error };
  const m = await safe(() => get(`/fleets/${f.fleet_id}/members/`, fcId));
  if (!ok(m)) return { inFleet: true, fleetId: f.fleet_id, role: f.role, boss: false, error: m.__status === 403 || m.__status === 404 ? 'You must be fleet boss to track members.' : m.__error };
  const names = await resolveNames(m.flatMap(x => [x.character_id, x.ship_type_id, x.solar_system_id]), fcId);
  return {
    inFleet: true, boss: true, fleetId: f.fleet_id, role: f.role,
    members: m.map(x => ({ id: x.character_id, name: names[x.character_id], ship: names[x.ship_type_id], shipTypeId: x.ship_type_id, system: names[x.solar_system_id], role: x.role, joined: x.join_time }))
  };
}

// ---------- Recruitment lookups ----------

async function lookupCharacter(name) {
  const r = await require('./esi').rawRequest('/universe/ids/', { method: 'POST', body: [name.trim()] });
  const c = (r.body.characters || [])[0];
  if (!c) throw new Error(`No character named "${name}" found.`);
  const [pub, hist] = await Promise.all([get(`/characters/${c.id}/`), safe(() => get(`/characters/${c.id}/corporationhistory/`))]);
  const h = ok(hist) ? hist : [];
  const names = await resolveNames([pub.corporation_id, pub.alliance_id, ...h.map(x => x.corporation_id)].filter(Boolean));
  const sorted = [...h].sort((a, b) => b.start_date.localeCompare(a.start_date));
  return {
    id: c.id, name: c.name, birthday: pub.birthday, securityStatus: pub.security_status,
    corporation: names[pub.corporation_id], alliance: pub.alliance_id ? names[pub.alliance_id] : null,
    history: sorted.map((x, i) => ({ corporation: names[x.corporation_id], corporationId: x.corporation_id, start: x.start_date, end: i ? sorted[i - 1].start_date : null })),
    corpCount: new Set(h.map(x => x.corporation_id)).size
  };
}

// ---------- Moon tax ----------

async function moonTax(directorId, from, to, ratePct) {
  const { corporationId } = await corpOf(directorId);
  const observers = await getAllPages(`/corporation/${corporationId}/mining/observers/`, directorId, 5);
  const rows = [];
  for (const o of observers) {
    const r = await safe(() => getAllPages(`/corporation/${corporationId}/mining/observers/${o.observer_id}/`, directorId, 20));
    if (ok(r)) for (const x of r) if (x.last_updated >= from.slice(0, 10) && x.last_updated <= to.slice(0, 10)) rows.push(x);
  }
  const prices = await marketPrices();
  const names = await resolveNames([...new Set(rows.flatMap(r => [r.character_id, r.type_id, r.recorded_corporation_id]))], directorId);
  const by = new Map();
  for (const r of rows) {
    const p = by.get(r.character_id) || { id: r.character_id, name: names[r.character_id], corp: names[r.recorded_corporation_id], quantity: 0, value: 0, ores: {} };
    const v = (prices.get(r.type_id) || 0) * r.quantity;
    p.quantity += r.quantity; p.value += v; p.ores[names[r.type_id]] = (p.ores[names[r.type_id]] || 0) + r.quantity;
    by.set(r.character_id, p);
  }
  const miners = [...by.values()].map(p => ({ ...p, tax: Math.round(p.value * ratePct / 100) })).sort((a, b) => b.value - a.value);
  return { from, to, rate: ratePct, miners, totalValue: miners.reduce((n, m) => n + m.value, 0), totalTax: miners.reduce((n, m) => n + m.tax, 0) };
}

/** Mark invoices paid when the pilot donated at least the amount to the corp after the invoice was issued. */
async function checkInvoicePayments(directorId, invoices, division = 1) {
  const { corporationId } = await corpOf(directorId);
  const journal = await getAllPages(`/corporations/${corporationId}/wallets/${division}/journal/`, directorId, 10);
  const donations = journal.filter(j => (j.ref_type === 'player_donation' || j.ref_type === 'corporation_account_withdrawal') && j.amount > 0);
  const used = new Set();
  return invoices.map(inv => {
    if (inv.status === 'paid') return inv;
    const paid = donations.filter(d => d.first_party_id === inv.pilotId && d.date >= inv.createdAt && !used.has(d.id)).sort((a, b) => a.date.localeCompare(b.date));
    let sum = 0; const ids = [];
    for (const d of paid) { if (sum >= inv.amount) break; sum += d.amount; ids.push(d.id); }
    if (sum >= inv.amount) { ids.forEach(i => used.add(i)); return { ...inv, status: 'paid', paidAt: new Date().toISOString(), paidAmount: sum }; }
    return { ...inv, paidAmount: sum };
  });
}

// ---------- Buyback ----------

async function buybackContracts(directorId) {
  const { corporationId } = await corpOf(directorId);
  const list = await getAllPages(`/corporations/${corporationId}/contracts/`, directorId, 5);
  const open = list.filter(c => c.type === 'item_exchange' && c.status === 'outstanding' && c.assignee_id === corporationId);
  const out = [];
  for (const c of open.slice(0, 40)) {
    const items = await safe(() => get(`/corporations/${corporationId}/contracts/${c.contract_id}/items/`, directorId));
    out.push({ contractId: c.contract_id, issuerId: c.issuer_id, price: c.price, title: c.title, issued: c.date_issued, items: ok(items) ? items.filter(i => i.is_included).map(i => ({ typeId: i.type_id, qty: i.quantity })) : [] });
  }
  const names = await resolveNames(out.map(c => c.issuerId), directorId);
  return out.map(c => ({ ...c, issuer: names[c.issuerId] }));
}

module.exports = {
  moonTax, checkInvoicePayments, buybackContracts,
  corpOf, overview, members, structures, moons, extractions, wallets, contracts, orders, industry, assets,
  killmails, killmailByLink, structureNotifications, currentFleet, lookupCharacter
};
