// Extended ESI loaders: training analytics, industry, PI, mining, R&D,
// finance extras, comms, social, combat and fittings.
const store = require('./store');
const { get, getAllPages, safe, ok, resolveNames, marketPrices } = require('./esi');

const DAY = 86400000;

// ---------- Static skill IDs used for slot / limit calculations ----------
const SKILL = {
  MASS_PRODUCTION: 3387, ADV_MASS_PRODUCTION: 24625,
  LAB_OPERATION: 3406, ADV_LAB_OPERATION: 24624,
  MASS_REACTIONS: 45748, ADV_MASS_REACTIONS: 45749,
  INTERPLANETARY_CONSOLIDATION: 2495, COMMAND_CENTER_UPGRADES: 2505,
  INDUSTRY: 3380, ADVANCED_INDUSTRY: 3388,
  INFOMORPH_PSYCHOLOGY: 24242, ADV_INFOMORPH_PSYCHOLOGY: 33407, INFOMORPH_SYNCHRONIZING: 33399,
  CONTRACTING: 25235, CORPORATION_CONTRACTING: 25233
};
// Trade skills: Trade (3443) +4 orders/level, Retail (3444) +8, Wholesale (16596) +16, Tycoon (18580) +32
const TRADE = { TRADE: 3443, RETAIL: 3444, WHOLESALE: 16596, TYCOON: 18580 };

const ACTIVITY = {
  1: { name: 'Manufacturing', slot: 'manufacturing' },
  3: { name: 'TE Research', slot: 'science' },
  4: { name: 'ME Research', slot: 'science' },
  5: { name: 'Copying', slot: 'science' },
  7: { name: 'Reverse Engineering', slot: 'science' },
  8: { name: 'Invention', slot: 'science' },
  9: { name: 'Reactions', slot: 'reaction' },
  11: { name: 'Reactions', slot: 'reaction' }
};

async function skillLevels(charId) {
  const s = await safe(() => get(`/characters/${charId}/skills/`, charId));
  const map = new Map();
  if (ok(s)) for (const k of s.skills) map.set(k.skill_id, k.active_skill_level);
  return map;
}
const lvl = (m, id) => m.get(id) || 0;

function slotLimits(levels) {
  return {
    manufacturing: 1 + lvl(levels, SKILL.MASS_PRODUCTION) + lvl(levels, SKILL.ADV_MASS_PRODUCTION),
    science: 1 + lvl(levels, SKILL.LAB_OPERATION) + lvl(levels, SKILL.ADV_LAB_OPERATION),
    reaction: 1 + lvl(levels, SKILL.MASS_REACTIONS) + lvl(levels, SKILL.ADV_MASS_REACTIONS),
    planets: 1 + lvl(levels, SKILL.INTERPLANETARY_CONSOLIDATION),
    orders: 5 + 4 * lvl(levels, TRADE.TRADE) + 8 * lvl(levels, TRADE.RETAIL) + 16 * lvl(levels, TRADE.WHOLESALE) + 32 * lvl(levels, TRADE.TYCOON),
    jumpClones: lvl(levels, SKILL.INFOMORPH_PSYCHOLOGY) + lvl(levels, SKILL.ADV_INFOMORPH_PSYCHOLOGY),
    cloneJumpHours: 24 - lvl(levels, SKILL.INFOMORPH_SYNCHRONIZING),
    contracts: 1 + 4 * lvl(levels, SKILL.CONTRACTING)
  };
}

// ---------- Training analytics ----------

async function training(charId) {
  const [queue, skills, attrs, implants] = await Promise.all([
    get(`/characters/${charId}/skillqueue/`, charId),
    get(`/characters/${charId}/skills/`, charId),
    safe(() => get(`/characters/${charId}/attributes/`, charId)),
    safe(() => get(`/characters/${charId}/implants/`, charId))
  ]);
  const names = await resolveNames([...queue.map(e => e.skill_id), ...(ok(implants) ? implants : [])], charId);
  const now = Date.now();
  const q = queue.sort((a, b) => a.queue_position - b.queue_position).map(e => {
    const start = e.start_date ? Date.parse(e.start_date) : null;
    const finish = e.finish_date ? Date.parse(e.finish_date) : null;
    const spToGo = (e.level_end_sp || 0) - (e.training_start_sp || 0);
    const hours = start && finish ? (finish - start) / 3.6e6 : null;
    const spPerHour = hours && hours > 0 ? spToGo / hours : null;
    let spDone = 0;
    if (start && finish && now > start) spDone = Math.min(spToGo, spToGo * (now - start) / (finish - start));
    return {
      skillId: e.skill_id, name: names[e.skill_id], level: e.finished_level, position: e.queue_position,
      start: e.start_date || null, finish: e.finish_date || null,
      levelStartSp: e.level_start_sp, levelEndSp: e.level_end_sp, trainingStartSp: e.training_start_sp,
      spToGo, spPerHour, spDone, complete: finish ? finish <= now : false
    };
  });
  const active = q.filter(e => e.finish && !e.complete);
  const current = active[0] || null;
  const spRemaining = active.reduce((n, e) => n + (e.spToGo - e.spDone), 0);
  const end = active.length ? Date.parse(active[active.length - 1].finish) : null;
  const within = ms => active.filter(e => Date.parse(e.finish) - now <= ms).length;

  // SP-per-level buckets of trained skills
  const levelDist = [0, 0, 0, 0, 0, 0];
  for (const k of skills.skills) levelDist[k.trained_skill_level]++;

  return {
    totalSp: skills.total_sp,
    unallocatedSp: skills.unallocated_sp || 0,
    spPerHour: current ? current.spPerHour : 0,
    spPerDay: current && current.spPerHour ? current.spPerHour * 24 : 0,
    spRemaining,
    projectedSp: skills.total_sp + spRemaining,
    queueEnd: end ? new Date(end).toISOString() : null,
    paused: queue.length > 0 && !queue.some(e => e.finish_date),
    finishing24h: within(DAY),
    finishing7d: within(7 * DAY),
    skillCount: skills.skills.length,
    levelDist,
    attributes: ok(attrs) ? attrs : null,
    implants: ok(implants) ? implants.map(i => ({ id: i, name: names[i] })) : [],
    queue: q
  };
}

// ---------- Industry ----------

async function industryFull(charId) {
  const [jobs, levels, pub] = await Promise.all([
    get(`/characters/${charId}/industry/jobs/?include_completed=true`, charId),
    skillLevels(charId),
    safe(() => get(`/characters/${charId}/`))
  ]);
  let corpJobs = [], corpError = null;
  if (ok(pub)) {
    const r = await safe(() => getAllPages(`/corporations/${pub.corporation_id}/industry/jobs/?include_completed=false`, charId, 5));
    if (ok(r)) corpJobs = r.filter(j => j.installer_id !== charId);
    else corpError = r.__status === 403 ? 'Corporation jobs need the Factory Manager role in your corporation.' : r.__error;
  }
  const all = [...jobs.map(j => ({ ...j, corp: false })), ...corpJobs.map(j => ({ ...j, corp: true }))];
  const [names, prices] = await Promise.all([resolveNames(all.flatMap(j => [j.blueprint_type_id, j.product_type_id, j.facility_id, j.installer_id]), charId), marketPrices()]);
  const now = Date.now();
  const limits = slotLimits(levels);
  const used = { manufacturing: 0, science: 0, reaction: 0 };
  const out = all.map(j => {
    const a = ACTIVITY[j.activity_id] || { name: `Activity ${j.activity_id}`, slot: 'science' };
    const start = Date.parse(j.start_date), end = Date.parse(j.end_date);
    const running = j.status === 'active' || j.status === 'paused';
    const ready = j.status === 'ready' || (j.status === 'active' && end <= now);
    if (!j.corp && (running || j.status === 'ready')) used[a.slot]++;
    return {
      jobId: j.job_id, corp: j.corp, activity: a.name, slot: a.slot, status: ready ? 'ready' : j.status,
      blueprintTypeId: j.blueprint_type_id, blueprint: names[j.blueprint_type_id],
      productTypeId: j.product_type_id || null, product: j.product_type_id ? names[j.product_type_id] : null,
      // Output value is only meaningful for manufacturing and reactions (runs × 1 unit is a lower bound for portion sizes)
      outputValue: (j.activity_id === 1 || j.activity_id === 9 || j.activity_id === 11) && j.product_type_id ? (prices.get(j.product_type_id) || 0) * j.runs : null,
      runs: j.runs, licensedRuns: j.licensed_runs, successfulRuns: j.successful_runs ?? null,
      probability: j.probability ?? null, cost: j.cost ?? null,
      facility: names[j.facility_id], installer: names[j.installer_id],
      start: j.start_date, end: j.end_date, completed: j.completed_date || null,
      progress: Math.max(0, Math.min(1, (now - start) / (end - start)))
    };
  }).sort((a, b) => {
    const rank = s => ({ ready: 0, active: 1, paused: 2 }[s] ?? 3);
    return rank(a.status) - rank(b.status) || a.end.localeCompare(b.end) * (rank(a.status) <= 2 ? 1 : -1);
  });
  return {
    slots: {
      manufacturing: { used: used.manufacturing, max: limits.manufacturing },
      science: { used: used.science, max: limits.science },
      reaction: { used: used.reaction, max: limits.reaction }
    },
    skills: {
      industry: lvl(levels, SKILL.INDUSTRY), advancedIndustry: lvl(levels, SKILL.ADVANCED_INDUSTRY),
      massProduction: lvl(levels, SKILL.MASS_PRODUCTION), advMassProduction: lvl(levels, SKILL.ADV_MASS_PRODUCTION),
      labOperation: lvl(levels, SKILL.LAB_OPERATION), advLabOperation: lvl(levels, SKILL.ADV_LAB_OPERATION),
      massReactions: lvl(levels, SKILL.MASS_REACTIONS), advMassReactions: lvl(levels, SKILL.ADV_MASS_REACTIONS)
    },
    corpError,
    jobs: out
  };
}

async function blueprints(charId) {
  const list = await getAllPages(`/characters/${charId}/blueprints/`, charId, 20);
  const [names, prices] = await Promise.all([resolveNames([...new Set(list.map(b => b.type_id))], charId), marketPrices()]);
  // Locations: only resolve station/structure-like ids (items inside containers show as "In container")
  const locIds = [...new Set(list.filter(b => b.location_flag === 'Hangar').map(b => b.location_id))];
  const locNames = await resolveNames(locIds, charId);
  return list.map(b => ({
    itemId: b.item_id, typeId: b.type_id, name: names[b.type_id],
    me: b.material_efficiency, te: b.time_efficiency,
    original: b.quantity === -1 || b.runs === -1, copy: b.quantity === -2,
    runs: b.runs, quantity: b.quantity > 0 ? b.quantity : 1,
    value: (b.quantity === -1 || b.runs === -1) ? (prices.get(b.type_id) || 0) * (b.quantity > 0 ? b.quantity : 1) : 0,
    location: locNames[b.location_id] || (b.location_flag && b.location_flag !== 'Hangar' ? b.location_flag.replace(/([a-z])([A-Z])/g, '$1 $2') : 'In container'),
    flag: b.location_flag
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Planetary interaction ----------

async function planetName(id) {
  const cache = store.get().nameCache;
  if (cache[id]) return cache[id].name;
  try {
    const p = await get(`/universe/planets/${id}/`);
    cache[id] = { name: p.name, category: 'planet' };
    store.save();
    return p.name;
  } catch { return `Planet ${id}`; }
}

async function schematicName(id) {
  const cache = store.get().nameCache;
  const key = 'schematic:' + id;
  if (cache[key]) return cache[key].name;
  try {
    const s = await get(`/universe/schematics/${id}/`);
    cache[key] = { name: s.schematic_name, cycle: s.cycle_time };
    store.save();
    return s.schematic_name;
  } catch { return `Schematic ${id}`; }
}

async function planets(charId) {
  const [list, levels] = await Promise.all([
    get(`/characters/${charId}/planets/`, charId),
    skillLevels(charId)
  ]);
  const now = Date.now();
  const details = await Promise.all(list.map(async p => {
    const d = await safe(() => get(`/characters/${charId}/planets/${p.planet_id}/`, charId));
    return { p, d: ok(d) ? d : null };
  }));
  const typeIds = new Set();
  for (const { p, d } of details) {
    typeIds.add(p.solar_system_id);
    if (!d) continue;
    for (const pin of d.pins) {
      typeIds.add(pin.type_id);
      if (pin.extractor_details && pin.extractor_details.product_type_id) typeIds.add(pin.extractor_details.product_type_id);
      for (const c of pin.contents || []) typeIds.add(c.type_id);
    }
  }
  const [names, prices] = await Promise.all([resolveNames([...typeIds], charId), marketPrices()]);
  const out = [];
  for (const { p, d } of details) {
    const extractors = [], factories = [], storage = [];
    let launchpads = 0;
    if (d) {
      for (const pin of d.pins) {
        const typeName = names[pin.type_id] || '';
        if (pin.extractor_details) {
          const exp = pin.expiry_time ? Date.parse(pin.expiry_time) : null;
          const ed = pin.extractor_details;
          const cycleH = ed.cycle_time ? ed.cycle_time / 3600 : null;
          extractors.push({
            product: ed.product_type_id ? names[ed.product_type_id] : 'Not configured',
            productTypeId: ed.product_type_id || null,
            heads: (ed.heads || []).length,
            qtyPerCycle: ed.qty_per_cycle || 0,
            cycleHours: cycleH,
            perHour: cycleH ? (ed.qty_per_cycle || 0) / cycleH : 0,
            installed: pin.install_time || null,
            expiry: pin.expiry_time || null,
            expired: exp ? exp <= now : true,
            lastCycleStart: pin.last_cycle_start || null
          });
        } else if (pin.factory_details || pin.schematic_id) {
          const sid = (pin.factory_details && pin.factory_details.schematic_id) || pin.schematic_id;
          factories.push({ type: typeName, schematicId: sid || null, schematic: sid ? await schematicName(sid) : 'Idle' });
        }
        if (/Launchpad/i.test(typeName)) launchpads++;
        if ((pin.contents || []).length && (/Storage|Launchpad|Command Center/i.test(typeName))) {
          const items = pin.contents.map(c => ({ name: names[c.type_id], typeId: c.type_id, amount: c.amount, value: (prices.get(c.type_id) || 0) * c.amount }));
          storage.push({ facility: typeName, items, value: items.reduce((n, i) => n + i.value, 0) });
        }
      }
    }
    const nextExpiry = extractors.filter(e => e.expiry).map(e => e.expiry).sort()[0] || null;
    out.push({
      planetId: p.planet_id, name: await planetName(p.planet_id), type: p.planet_type,
      system: names[p.solar_system_id], upgradeLevel: p.upgrade_level, pins: p.num_pins,
      lastUpdate: p.last_update, extractors, factories, storage, launchpads,
      storageValue: storage.reduce((n, st) => n + st.value, 0),
      nextExpiry, anyExpired: extractors.some(e => e.expired), error: d ? null : 'Could not load planet layout'
    });
  }
  out.sort((a, b) => (a.nextExpiry || '9').localeCompare(b.nextExpiry || '9'));
  return {
    maxPlanets: 1 + lvl(levels, SKILL.INTERPLANETARY_CONSOLIDATION),
    ccUpgrades: lvl(levels, SKILL.COMMAND_CENTER_UPGRADES),
    planets: out
  };
}

// ---------- Mining ledger ----------

async function mining(charId) {
  const rows = await getAllPages(`/characters/${charId}/mining/`, charId, 10);
  const [names, prices] = await Promise.all([resolveNames([...new Set(rows.flatMap(r => [r.type_id, r.solar_system_id]))], charId), marketPrices()]);
  const val = r => (prices.get(r.type_id) || 0) * r.quantity;
  const byDay = new Map(), byOre = new Map(), bySystem = new Map();
  for (const r of rows) {
    byDay.set(r.date, (byDay.get(r.date) || 0) + r.quantity);
    const o = byOre.get(r.type_id) || { typeId: r.type_id, name: names[r.type_id], quantity: 0, value: 0 };
    o.quantity += r.quantity; o.value += val(r); byOre.set(r.type_id, o);
    bySystem.set(r.solar_system_id, (bySystem.get(r.solar_system_id) || 0) + r.quantity);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    entries: rows.map(r => ({ date: r.date, ore: names[r.type_id], typeId: r.type_id, system: names[r.solar_system_id], quantity: r.quantity, value: val(r) }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    days: days.map(([date, quantity]) => ({ date, quantity })),
    ores: [...byOre.values()].sort((a, b) => b.quantity - a.quantity),
    systems: [...bySystem.entries()].map(([id, q]) => ({ name: names[id], quantity: q })).sort((a, b) => b.quantity - a.quantity),
    total: rows.reduce((n, r) => n + r.quantity, 0),
    totalValue: rows.reduce((n, r) => n + val(r), 0)
  };
}

// ---------- R&D agents ----------

async function research(charId) {
  const list = await get(`/characters/${charId}/agents_research/`, charId);
  const names = await resolveNames(list.flatMap(a => [a.agent_id, a.skill_type_id]), charId);
  const now = Date.now();
  return list.map(a => {
    const days = (now - Date.parse(a.started_at)) / DAY;
    return {
      agent: names[a.agent_id], agentId: a.agent_id, field: names[a.skill_type_id],
      pointsPerDay: a.points_per_day, startedAt: a.started_at,
      points: (a.remainder_points || 0) + a.points_per_day * days
    };
  }).sort((a, b) => b.points - a.points);
}

// ---------- Finance extras ----------

async function loyalty(charId) {
  const list = await get(`/characters/${charId}/loyalty/points/`, charId);
  const names = await resolveNames(list.map(l => l.corporation_id), charId);
  return list.map(l => ({ corporationId: l.corporation_id, corporation: names[l.corporation_id], points: l.loyalty_points }))
    .sort((a, b) => b.points - a.points);
}

async function ordersFull(charId) {
  const [open, history, levels] = await Promise.all([
    get(`/characters/${charId}/orders/`, charId),
    safe(() => getAllPages(`/characters/${charId}/orders/history/`, charId, 5)),
    skillLevels(charId)
  ]);
  const hist = ok(history) ? history : [];
  const names = await resolveNames([...open, ...hist].flatMap(o => [o.type_id, o.location_id, o.region_id]), charId);
  const map = o => ({ ...o, typeName: names[o.type_id], locationName: names[o.location_id], regionName: names[o.region_id] });
  return {
    maxOrders: slotLimits(levels).orders,
    open: open.map(map),
    history: hist.map(map).sort((a, b) => b.issued.localeCompare(a.issued)).slice(0, 500)
  };
}

async function contractItems(charId, contractId) {
  const items = await get(`/characters/${charId}/contracts/${contractId}/items/`, charId);
  const names = await resolveNames(items.map(i => i.type_id), charId);
  return items.map(i => ({ name: names[i.type_id], typeId: i.type_id, quantity: i.quantity, included: i.is_included, singleton: i.is_singleton }));
}

// ---------- Comms ----------

async function notifications(charId) {
  const list = await get(`/characters/${charId}/notifications/`, charId);
  const names = await resolveNames(list.filter(n => ['character', 'corporation', 'alliance', 'faction'].includes(n.sender_type)).map(n => n.sender_id), charId);
  return list.map(n => ({
    id: n.notification_id, type: n.type, typeLabel: n.type.replace(/([a-z])([A-Z])/g, '$1 $2'),
    sender: names[n.sender_id] || humanSender(n.sender_type), senderType: n.sender_type,
    timestamp: n.timestamp, isRead: !!n.is_read, text: n.text || ''
  })).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
const humanSender = t => ({ other: 'EVE', character: 'Character', corporation: 'Corporation', alliance: 'Alliance', faction: 'Faction' }[t] || t);

async function calendar(charId) {
  const list = await get(`/characters/${charId}/calendar/`, charId);
  const detailed = await Promise.all(list.slice(0, 30).map(async e => {
    const d = await safe(() => get(`/characters/${charId}/calendar/${e.event_id}/`, charId));
    return { ...e, detail: ok(d) ? d : null };
  }));
  return detailed.map(e => ({
    id: e.event_id, date: e.event_date, title: e.title, importance: e.importance, response: e.event_response,
    owner: e.detail ? e.detail.owner_name : null, duration: e.detail ? e.detail.duration : null,
    text: e.detail ? e.detail.text : ''
  })).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Character / social ----------

async function corporation(charId) {
  const pub = await get(`/characters/${charId}/`);
  const [corp, history, roles, titles, fw, alliance] = await Promise.all([
    safe(() => get(`/corporations/${pub.corporation_id}/`)),
    safe(() => get(`/characters/${charId}/corporationhistory/`)),
    safe(() => get(`/characters/${charId}/roles/`, charId)),
    safe(() => get(`/characters/${charId}/titles/`, charId)),
    safe(() => get(`/characters/${charId}/fw/stats/`, charId)),
    pub.alliance_id ? safe(() => get(`/alliances/${pub.alliance_id}/`)) : null
  ]);
  const hist = ok(history) ? history : [];
  const ids = [pub.corporation_id, pub.alliance_id, ...hist.map(h => h.corporation_id)];
  if (ok(corp)) ids.push(corp.ceo_id, corp.home_station_id);
  if (ok(fw) && fw.faction_id) ids.push(fw.faction_id);
  const names = await resolveNames(ids.filter(Boolean), charId);
  const sorted = [...hist].sort((a, b) => b.start_date.localeCompare(a.start_date));
  return {
    corporationId: pub.corporation_id,
    corporation: ok(corp) ? {
      name: corp.name, ticker: corp.ticker, members: corp.member_count, taxRate: corp.tax_rate,
      ceo: names[corp.ceo_id], founded: corp.date_founded || null, home: corp.home_station_id ? names[corp.home_station_id] : null,
      url: corp.url || null, war: !!corp.war_eligible
    } : { name: names[pub.corporation_id] },
    alliance: alliance && ok(alliance) ? { id: pub.alliance_id, name: alliance.name, ticker: alliance.ticker, founded: alliance.date_founded } : null,
    history: sorted.map((h, i) => ({
      corporation: names[h.corporation_id], corporationId: h.corporation_id, start: h.start_date,
      end: i > 0 ? sorted[i - 1].start_date : null, deleted: !!h.is_deleted
    })),
    roles: ok(roles) ? (roles.roles || []) : null,
    titles: ok(titles) ? titles.map(t => String(t.name || '').replace(/<[^>]+>/g, '')) : null,
    fw: ok(fw) && fw.faction_id ? {
      faction: names[fw.faction_id], enlisted: fw.enlisted_on, rank: fw.current_rank, highestRank: fw.highest_rank,
      kills: fw.kills, victoryPoints: fw.victory_points
    } : null
  };
}

async function standings(charId) {
  const list = await get(`/characters/${charId}/standings/`, charId);
  const names = await resolveNames(list.map(s => s.from_id), charId);
  return list.map(s => ({ id: s.from_id, name: names[s.from_id], type: s.from_type, standing: s.standing }))
    .sort((a, b) => b.standing - a.standing);
}

async function contacts(charId) {
  const [list, labels] = await Promise.all([
    getAllPages(`/characters/${charId}/contacts/`, charId, 10),
    safe(() => get(`/characters/${charId}/contacts/labels/`, charId))
  ]);
  const names = await resolveNames(list.map(c => c.contact_id), charId);
  const labelMap = new Map((ok(labels) ? labels : []).map(l => [l.label_id, l.label_name]));
  return list.map(c => ({
    id: c.contact_id, name: names[c.contact_id], type: c.contact_type, standing: c.standing,
    watched: !!c.is_watched, blocked: !!c.is_blocked, labels: (c.label_ids || []).map(l => labelMap.get(l)).filter(Boolean)
  })).sort((a, b) => b.standing - a.standing || a.name.localeCompare(b.name));
}

async function medals(charId) {
  const list = await get(`/characters/${charId}/medals/`, charId);
  const names = await resolveNames(list.flatMap(m => [m.corporation_id, m.issuer_id]), charId);
  return list.map(m => ({
    title: m.title, description: m.description, reason: m.reason, date: m.date, status: m.status,
    corporation: names[m.corporation_id], issuer: names[m.issuer_id]
  })).sort((a, b) => b.date.localeCompare(a.date));
}

async function fatigue(charId) {
  const [f, clones, levels] = await Promise.all([
    safe(() => get(`/characters/${charId}/fatigue/`, charId)),
    safe(() => get(`/characters/${charId}/clones/`, charId)),
    skillLevels(charId)
  ]);
  const lim = slotLimits(levels);
  const lastJump = ok(clones) ? clones.last_clone_jump_date : null;
  return {
    fatigueExpires: ok(f) ? f.jump_fatigue_expire_date || null : null,
    lastJump: ok(f) ? f.last_jump_date || null : null,
    lastUpdate: ok(f) ? f.last_update_date || null : null,
    cloneJumpHours: lim.cloneJumpHours,
    nextCloneJump: lastJump ? new Date(Date.parse(lastJump) + lim.cloneJumpHours * 3.6e6).toISOString() : null,
    maxJumpClones: lim.jumpClones
  };
}

// ---------- Combat ----------

const killmailCache = new Map();
async function killmails(charId) {
  const list = await get(`/characters/${charId}/killmails/recent/`, charId);
  const recent = list.slice(0, 60);
  const kms = [];
  for (let i = 0; i < recent.length; i += 10) {
    const batch = await Promise.all(recent.slice(i, i + 10).map(async k => {
      if (killmailCache.has(k.killmail_id)) return killmailCache.get(k.killmail_id);
      const r = await safe(() => get(`/killmails/${k.killmail_id}/${k.killmail_hash}/`));
      if (ok(r)) killmailCache.set(k.killmail_id, r);
      return ok(r) ? r : null;
    }));
    kms.push(...batch.filter(Boolean));
  }
  const ids = new Set();
  for (const k of kms) {
    ids.add(k.solar_system_id); ids.add(k.victim.ship_type_id);
    if (k.victim.character_id) ids.add(k.victim.character_id);
    if (k.victim.corporation_id) ids.add(k.victim.corporation_id);
    const fb = k.attackers.find(a => a.final_blow);
    if (fb) { if (fb.character_id) ids.add(fb.character_id); if (fb.ship_type_id) ids.add(fb.ship_type_id); if (fb.corporation_id) ids.add(fb.corporation_id); }
    const me = k.attackers.find(a => a.character_id === charId);
    if (me && me.ship_type_id) ids.add(me.ship_type_id);
  }
  const names = await resolveNames([...ids].filter(Boolean), charId);
  const out = kms.map(k => {
    const loss = k.victim.character_id === charId;
    const fb = k.attackers.find(a => a.final_blow) || {};
    const me = k.attackers.find(a => a.character_id === charId);
    return {
      id: k.killmail_id, time: k.killmail_time, loss,
      system: names[k.solar_system_id],
      victim: names[k.victim.character_id] || names[k.victim.corporation_id] || 'Structure / NPC',
      victimCorp: names[k.victim.corporation_id],
      ship: names[k.victim.ship_type_id], shipTypeId: k.victim.ship_type_id,
      damage: k.victim.damage_taken, attackers: k.attackers.length,
      finalBlow: names[fb.character_id] || (fb.faction_id ? 'NPC' : '—'),
      finalBlowShip: fb.ship_type_id ? names[fb.ship_type_id] : null,
      myShip: me && me.ship_type_id ? names[me.ship_type_id] : null,
      myDamage: me ? me.damage_done : null,
      solo: k.attackers.length === 1
    };
  }).sort((a, b) => b.time.localeCompare(a.time));
  return {
    kills: out.filter(k => !k.loss).length,
    losses: out.filter(k => k.loss).length,
    list: out
  };
}

// ---------- Fittings ----------

const SLOT_ORDER = [
  ['HiSlot', 'High slots'], ['MedSlot', 'Mid slots'], ['LoSlot', 'Low slots'], ['RigSlot', 'Rigs'],
  ['SubSystemSlot', 'Subsystems'], ['ServiceSlot', 'Services'], ['DroneBay', 'Drone bay'], ['FighterBay', 'Fighter bay'], ['Cargo', 'Cargo']
];
async function fittings(charId) {
  const list = await get(`/characters/${charId}/fittings/`, charId);
  const names = await resolveNames([...new Set(list.flatMap(f => [f.ship_type_id, ...f.items.map(i => i.type_id)]))], charId);
  return list.map(f => {
    const groups = SLOT_ORDER.map(([k, label]) => ({
      label,
      items: f.items.filter(i => String(i.flag).startsWith(k)).map(i => ({ name: names[i.type_id], typeId: i.type_id, quantity: i.quantity }))
    })).filter(g => g.items.length);
    const other = f.items.filter(i => !SLOT_ORDER.some(([k]) => String(i.flag).startsWith(k)));
    if (other.length) groups.push({ label: 'Other', items: other.map(i => ({ name: names[i.type_id], typeId: i.type_id, quantity: i.quantity })) });
    return { id: f.fitting_id, name: f.name, description: f.description, shipTypeId: f.ship_type_id, ship: names[f.ship_type_id], groups };
  }).sort((a, b) => a.ship.localeCompare(b.ship) || a.name.localeCompare(b.name));
}

module.exports = {
  training, industryFull, blueprints, planets, mining, research, loyalty, ordersFull, contractItems,
  notifications, calendar, corporation, standings, contacts, medals, fatigue, killmails, fittings
};
