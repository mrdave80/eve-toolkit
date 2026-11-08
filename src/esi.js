// ESI client: token refresh, paging, caching, name resolution and
// high-level loaders that return renderer-ready data.
const store = require('./store');
const auth = require('./auth');

const ESI = 'https://esi.evetech.net/latest';
const COMPAT_DATE = '2025-08-26';

const accessTokens = new Map();   // charId -> { token, exp }
const refreshing = new Map();     // charId -> Promise
const responseCache = new Map();  // url -> { etag, body, pages, expires }
const sessionNames = new Map();   // structures we could not resolve (retried next app start)

class EsiError extends Error {
  constructor(msg, status, path) { super(msg); this.status = status; this.path = path; }
}

async function getAccessToken(charId) {
  const cached = accessTokens.get(charId);
  if (cached && cached.exp - Date.now() > 60_000) return cached.token;
  if (refreshing.has(charId)) return refreshing.get(charId);

  const p = (async () => {
    const data = store.get();
    const ch = data.characters.find(c => c.id === charId);
    if (!ch) throw new EsiError('Unknown character', 0);
    const refreshToken = store.decryptToken(ch);
    if (!refreshToken) throw new EsiError('No refresh token stored', 401);
    try {
      const t = await auth.refresh({ clientId: data.settings.clientId, refreshToken });
      const info = auth.parseAccessToken(t.access_token);
      accessTokens.set(charId, { token: t.access_token, exp: info.exp });
      if (t.refresh_token && t.refresh_token !== refreshToken) store.setRefreshToken(charId, t.refresh_token);
      if (ch.needsReauth || JSON.stringify(ch.scopes) !== JSON.stringify(info.scopes)) {
        ch.needsReauth = false; ch.scopes = info.scopes; store.save();
      }
      return t.access_token;
    } catch (e) {
      if (e.status === 400 || e.status === 401) { ch.needsReauth = true; store.save(); }
      throw new EsiError(`Could not refresh login for ${ch.name}: ${e.message}`, e.status || 0);
    }
  })();
  refreshing.set(charId, p);
  try { return await p; } finally { refreshing.delete(charId); }
}

async function rawRequest(path, { charId, method = 'GET', body, page } = {}) {
  let url = ESI + path + (path.includes('?') ? '&' : '?') + 'datasource=tranquility';
  if (page) url += `&page=${page}`;
  const headers = {
    'User-Agent': auth.USER_AGENT,
    'Accept': 'application/json',
    'X-Compatibility-Date': COMPAT_DATE
  };
  if (charId) headers.Authorization = `Bearer ${await getAccessToken(charId)}`;
  if (body) headers['Content-Type'] = 'application/json';

  const cacheKey = (charId || 0) + ' ' + method + ' ' + url + (body ? JSON.stringify(body) : '');
  const hit = method === 'GET' ? responseCache.get(cacheKey) : null;
  if (hit && hit.expires > Date.now()) return hit;
  if (hit && hit.etag) headers['If-None-Match'] = hit.etag;

  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    if (res.status === 420 || res.status === 429) {
      const wait = Number(res.headers.get('x-esi-error-limit-reset') || res.headers.get('retry-after') || 5);
      await new Promise(r => setTimeout(r, Math.min(wait, 30) * 1000));
      continue;
    }
    break;
  }

  const expiresHdr = res.headers.get('expires');
  const expires = expiresHdr ? Date.parse(expiresHdr) : Date.now() + 60_000;
  if (res.status === 304 && hit) {
    hit.expires = expires;
    return hit;
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    if (res.status === 401 || res.status === 403) accessTokens.delete(charId);
    try { require('./diag').warn('esi', `${res.status} ${method} ${path.split('?')[0]}: ${msg}`); } catch {}
    throw new EsiError(`ESI ${path}: ${msg}`, res.status, path);
  }
  const text = res.status === 204 ? '' : await res.text();
  const entry = {
    body: text ? JSON.parse(text) : null,
    pages: Number(res.headers.get('x-pages') || 1),
    etag: res.headers.get('etag'),
    expires
  };
  if (method === 'GET') responseCache.set(cacheKey, entry);
  return entry;
}

async function get(path, charId) {
  return (await rawRequest(path, { charId })).body;
}

async function getAllPages(path, charId, maxPages = 50) {
  const first = await rawRequest(path, { charId, page: 1 });
  let out = [...first.body];
  const pages = Math.min(first.pages, maxPages);
  for (let p = 2; p <= pages; p++) {
    const r = await rawRequest(path, { charId, page: p });
    out = out.concat(r.body);
  }
  return out;
}

const safe = async (fn, fallback = null) => {
  try { return await fn(); } catch (e) { return { __error: e.message, __status: e.status, fallback }; }
};
const ok = v => v && !v.__error;

// ---------- Name resolution ----------

async function resolveNames(ids, charId) {
  const data = store.get();
  const cache = data.nameCache;
  const want = [...new Set(ids.filter(id => id && cache[id] === undefined && !sessionNames.has(id)))];
  const ordinary = want.filter(id => id < 1_000_000_000_000);  // structures are > 1e12
  const structures = want.filter(id => id >= 1_000_000_000_000);

  async function post(chunk) {
    if (!chunk.length) return;
    try {
      const r = await rawRequest('/universe/names/', { method: 'POST', body: chunk });
      for (const n of r.body) cache[n.id] = { name: n.name, category: n.category };
    } catch (e) {
      if (chunk.length === 1) { cache[chunk[0]] = { name: `#${chunk[0]}`, category: 'unknown' }; return; }
      const mid = Math.ceil(chunk.length / 2);   // one bad id fails the whole request: split
      await post(chunk.slice(0, mid));
      await post(chunk.slice(mid));
    }
  }
  for (let i = 0; i < ordinary.length; i += 900) await post(ordinary.slice(i, i + 900));

  for (const sid of structures) {
    try {
      const s = await get(`/universe/structures/${sid}/`, charId);
      cache[sid] = { name: s.name, category: 'structure', system: s.solar_system_id };
    } catch {
      // Not docking-accessible or a container item: don't cache permanently
      sessionNames.set(sid, `Structure ${sid}`);
    }
  }
  if (want.length) store.save('nameCache');
  const out = {};
  for (const id of ids) if (id) out[id] = cache[id] ? cache[id].name : (sessionNames.get(id) || `#${id}`);
  return out;
}

// ---------- Skill groups (category 16 = Skills) ----------

async function getSkillGroups() {
  const data = store.get();
  const week = 7 * 24 * 3600 * 1000;
  if (data.skillGroups && Date.now() - data.skillGroups.fetched < week) return data.skillGroups.groups;
  const cat = await get('/universe/categories/16/');
  const groups = [];
  for (const gid of cat.groups) {
    const g = await get(`/universe/groups/${gid}/`);
    if (g.published === false) continue;
    groups.push({ id: gid, name: g.name, types: g.types });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  data.skillGroups = { fetched: Date.now(), groups };
  store.save();
  return groups;
}

// ---------- Market prices (CCP universe-wide average, refreshed hourly) ----------

let priceCache = { at: 0, map: new Map() };
async function marketPrices() {
  if (Date.now() - priceCache.at < 3600_000 && priceCache.map.size) return priceCache.map;
  try {
    const list = await get('/markets/prices/');
    priceCache = { at: Date.now(), map: new Map(list.map(p => [p.type_id, p.average_price || p.adjusted_price || 0])) };
  } catch { /* keep old prices if any */ }
  // Prices the user set for contract-only items (supercarriers, titans) win over CCP's estimate.
  const ov = (store.get() || {}).priceOverrides;
  if (!ov || !Object.keys(ov).length) return priceCache.map;
  const merged = new Map(priceCache.map);
  for (const [id, v] of Object.entries(ov)) if (Number(v) > 0) merged.set(Number(id), Number(v));
  return merged;
}

// ---------- Type IDs by exact name (for static data like PI) ----------

async function typeIdsByName(names) {
  const data = store.get();
  data.typeIds = data.typeIds || {};
  const want = names.filter(n => !data.typeIds[n]);
  for (let i = 0; i < want.length; i += 400) {
    const r = await rawRequest('/universe/ids/', { method: 'POST', body: want.slice(i, i + 400) });
    for (const t of r.body.inventory_types || []) data.typeIds[t.name] = t.id;
  }
  if (want.length) store.save();
  const out = {};
  for (const n of names) out[n] = data.typeIds[n] || null;
  return out;
}

// ---------- Skill details (description, rank, attributes, prerequisites) ----------

const ATTR = { 164: 'Charisma', 165: 'Intelligence', 166: 'Memory', 167: 'Perception', 168: 'Willpower' };
const REQ = [[182, 277], [183, 278], [184, 279], [1285, 1286], [1289, 1287], [1290, 1288]];
async function skillInfo(typeId) {
  const data = store.get();
  data.skillInfo = data.skillInfo || {};
  if (data.skillInfo[typeId]) return data.skillInfo[typeId];
  const t = await get(`/universe/types/${typeId}/`);
  const d = new Map((t.dogma_attributes || []).map(a => [a.attribute_id, a.value]));
  const info = {
    id: typeId, name: t.name,
    description: String(t.description || '').replace(/<[^>]+>/g, '').trim(),
    rank: d.get(275) || 1,
    primary: ATTR[d.get(180)] || null, secondary: ATTR[d.get(181)] || null,
    requires: REQ.filter(([s]) => d.has(s)).map(([s, l]) => ({ id: d.get(s), level: d.get(l) || 1 })),
    group: t.group_id
  };
  data.skillInfo[typeId] = info;
  store.save();
  return info;
}

// ---------- High-level loaders ----------

async function serverStatus() {
  return get('/status/');
}

async function overview(charId) {
  const [pub, skills, queue, wallet, loc, ship, online] = await Promise.all([
    safe(() => get(`/characters/${charId}/`)),
    safe(() => get(`/characters/${charId}/skills/`, charId)),
    safe(() => get(`/characters/${charId}/skillqueue/`, charId)),
    safe(() => get(`/characters/${charId}/wallet/`, charId)),
    safe(() => get(`/characters/${charId}/location/`, charId)),
    safe(() => get(`/characters/${charId}/ship/`, charId)),
    safe(() => get(`/characters/${charId}/online/`, charId))
  ]);
  const ids = [];
  if (ok(pub)) ids.push(pub.corporation_id, pub.alliance_id);
  if (ok(loc)) ids.push(loc.solar_system_id, loc.station_id, loc.structure_id);
  if (ok(ship)) ids.push(ship.ship_type_id);
  const q = ok(queue) ? queue : [];
  ids.push(...q.map(e => e.skill_id));
  const names = await resolveNames(ids.filter(Boolean), charId);

  const now = Date.now();
  const active = q.filter(e => e.finish_date && Date.parse(e.finish_date) > now)
    .sort((a, b) => a.queue_position - b.queue_position);
  const paused = q.length > 0 && !q.some(e => e.finish_date);
  const current = active[0] || (paused ? q.sort((a, b) => a.queue_position - b.queue_position)[0] : null);
  const queueEnd = active.length ? active[active.length - 1].finish_date : null;

  return {
    id: charId,
    name: ok(pub) ? pub.name : null,
    corporation: ok(pub) ? names[pub.corporation_id] : null,
    alliance: ok(pub) && pub.alliance_id ? names[pub.alliance_id] : null,
    securityStatus: ok(pub) ? pub.security_status : null,
    birthday: ok(pub) ? pub.birthday : null,
    totalSp: ok(skills) ? skills.total_sp : null,
    unallocatedSp: ok(skills) ? (skills.unallocated_sp || 0) : null,
    wallet: ok(wallet) ? wallet : null,
    system: ok(loc) ? names[loc.solar_system_id] : null,
    systemId: ok(loc) ? loc.solar_system_id : null,
    docked: ok(loc) ? (names[loc.station_id] || names[loc.structure_id] || null) : null,
    ship: ok(ship) ? { type: names[ship.ship_type_id], typeId: ship.ship_type_id, name: ship.ship_name } : null,
    online: ok(online) ? online : null,
    training: current ? {
      skill: names[current.skill_id], level: current.finished_level,
      start: current.start_date, finish: current.finish_date,
      levelStartSp: current.level_start_sp, levelEndSp: current.level_end_sp,
      trainingStartSp: current.training_start_sp
    } : null,
    paused,
    queueLength: q.length,
    queueEnd,
    errors: [pub, skills, queue, wallet, loc, ship, online].filter(x => x && x.__error).map(x => x.__error)
  };
}

async function skillQueue(charId) {
  const [queue, attrs] = await Promise.all([
    get(`/characters/${charId}/skillqueue/`, charId),
    safe(() => get(`/characters/${charId}/attributes/`, charId))
  ]);
  const names = await resolveNames(queue.map(e => e.skill_id), charId);
  return {
    attributes: ok(attrs) ? attrs : null,
    queue: queue.sort((a, b) => a.queue_position - b.queue_position).map(e => ({
      ...e, name: names[e.skill_id]
    }))
  };
}

async function skills(charId) {
  const [s, groups] = await Promise.all([
    get(`/characters/${charId}/skills/`, charId),
    getSkillGroups()
  ]);
  const byId = new Map(s.skills.map(k => [k.skill_id, k]));
  const names = await resolveNames(s.skills.map(k => k.skill_id), charId);
  const out = [];
  for (const g of groups) {
    const trained = g.types.filter(t => byId.has(t)).map(t => {
      const k = byId.get(t);
      return { id: t, name: names[t], level: k.trained_skill_level, active: k.active_skill_level, sp: k.skillpoints_in_skill };
    }).sort((a, b) => a.name.localeCompare(b.name));
    if (!trained.length) continue;
    out.push({
      name: g.name,
      sp: trained.reduce((n, k) => n + k.sp, 0),
      count: trained.length,
      total: g.types.length,
      skills: trained
    });
  }
  return { totalSp: s.total_sp, unallocatedSp: s.unallocated_sp || 0, groups: out };
}

async function wallet(charId) {
  const [balance, journal, transactions] = await Promise.all([
    get(`/characters/${charId}/wallet/`, charId),
    getAllPages(`/characters/${charId}/wallet/journal/`, charId, 5),
    safe(() => get(`/characters/${charId}/wallet/transactions/`, charId))
  ]);
  const tx = ok(transactions) ? transactions : [];
  const names = await resolveNames([
    ...tx.map(t => t.type_id), ...tx.map(t => t.location_id), ...tx.map(t => t.client_id)
  ], charId);
  return {
    balance,
    journal: journal.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500),
    transactions: tx.sort((a, b) => b.date.localeCompare(a.date)).map(t => ({
      ...t, typeName: names[t.type_id], locationName: names[t.location_id], clientName: names[t.client_id]
    }))
  };
}

async function mailList(charId) {
  const [mails, labels] = await Promise.all([
    get(`/characters/${charId}/mail/`, charId),
    safe(() => get(`/characters/${charId}/mail/labels/`, charId))
  ]);
  const names = await resolveNames(mails.map(m => m.from), charId);
  return {
    unread: ok(labels) ? labels.total_unread_count : null,
    mails: mails.map(m => ({ ...m, fromName: names[m.from] || `#${m.from}` }))
  };
}

async function mailBody(charId, mailId) {
  const m = await get(`/characters/${charId}/mail/${mailId}/`, charId);
  const ids = [m.from, ...(m.recipients || []).filter(r => r.recipient_type !== 'mailing_list').map(r => r.recipient_id)];
  const names = await resolveNames(ids, charId);
  return {
    ...m,
    fromName: names[m.from],
    recipientNames: (m.recipients || []).map(r => names[r.recipient_id] || (r.recipient_type === 'mailing_list' ? 'Mailing list' : `#${r.recipient_id}`))
  };
}

async function contracts(charId) {
  const list = await getAllPages(`/characters/${charId}/contracts/`, charId, 5);
  const ids = [];
  for (const c of list) ids.push(c.issuer_id, c.assignee_id, c.acceptor_id, c.start_location_id, c.end_location_id);
  const names = await resolveNames(ids.filter(x => x && x !== 0), charId);
  return list.sort((a, b) => b.date_issued.localeCompare(a.date_issued)).map(c => ({
    ...c,
    issuerName: names[c.issuer_id],
    assigneeName: c.assignee_id ? names[c.assignee_id] : null,
    acceptorName: c.acceptor_id ? names[c.acceptor_id] : null,
    startName: c.start_location_id ? names[c.start_location_id] : null,
    endName: c.end_location_id ? names[c.end_location_id] : null
  }));
}

async function clones(charId) {
  const [c, implants] = await Promise.all([
    get(`/characters/${charId}/clones/`, charId),
    safe(() => get(`/characters/${charId}/implants/`, charId))
  ]);
  const ids = [];
  if (c.home_location) ids.push(c.home_location.location_id);
  for (const j of c.jump_clones || []) { ids.push(j.location_id, ...(j.implants || [])); }
  if (ok(implants)) ids.push(...implants);
  const names = await resolveNames(ids, charId);
  return {
    home: c.home_location ? names[c.home_location.location_id] : null,
    lastJump: c.last_clone_jump_date || null,
    lastStationChange: c.last_station_change_date || null,
    activeImplants: ok(implants) ? implants.map(i => names[i]) : [],
    jumpClones: (c.jump_clones || []).map(j => ({
      name: j.name || null,
      location: names[j.location_id],
      implants: (j.implants || []).map(i => names[i])
    }))
  };
}

const ACTIVITIES = { 1: 'Manufacturing', 3: 'TE Research', 4: 'ME Research', 5: 'Copying', 7: 'Reverse Eng.', 8: 'Invention', 9: 'Reactions', 11: 'Reactions' };

async function industry(charId) {
  const jobs = await get(`/characters/${charId}/industry/jobs/?include_completed=true`, charId);
  const names = await resolveNames(jobs.flatMap(j => [j.blueprint_type_id, j.product_type_id, j.facility_id]), charId);
  return jobs.sort((a, b) => b.end_date.localeCompare(a.end_date)).map(j => ({
    ...j,
    activity: ACTIVITIES[j.activity_id] || `Activity ${j.activity_id}`,
    blueprint: names[j.blueprint_type_id],
    product: j.product_type_id ? names[j.product_type_id] : null,
    facility: names[j.facility_id]
  }));
}

async function orders(charId) {
  const list = await get(`/characters/${charId}/orders/`, charId);
  const names = await resolveNames(list.flatMap(o => [o.type_id, o.location_id, o.region_id]), charId);
  return list.map(o => ({ ...o, typeName: names[o.type_id], locationName: names[o.location_id], regionName: names[o.region_id] }));
}

async function assets(charId) {
  const list = await getAllPages(`/characters/${charId}/assets/`, charId, 20);
  const byItem = new Map(list.map(a => [a.item_id, a]));
  // Walk up container chains to find the top-level location of each item.
  const rootOf = a => {
    let cur = a, guard = 0;
    while (byItem.has(cur.location_id) && guard++ < 10) cur = byItem.get(cur.location_id);
    return cur.location_id;
  };
  const topLevel = new Map();
  for (const a of list) {
    const loc = rootOf(a);
    if (!topLevel.has(loc)) topLevel.set(loc, []);
    topLevel.get(loc).push(a);
  }
  const [names, prices] = await Promise.all([
    resolveNames([...topLevel.keys(), ...new Set(list.map(a => a.type_id))], charId),
    marketPrices()
  ]);
  const locations = [...topLevel.entries()].map(([loc, items]) => {
    const agg = new Map();
    for (const it of items) {
      const k = it.type_id;
      // Blueprint copies report the BPO price, so don't value them.
      const unit = it.is_blueprint_copy ? 0 : (prices.get(k) || 0);
      const cur = agg.get(k) || { typeId: k, name: names[k], quantity: 0, singleton: it.is_singleton, unitPrice: unit, value: 0 };
      cur.quantity += it.quantity;
      cur.value += unit * it.quantity;
      agg.set(k, cur);
    }
    const arr = [...agg.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    return {
      id: loc,
      name: names[loc] || `Location ${loc}`,
      itemCount: items.length,
      value: arr.reduce((n, i) => n + i.value, 0),
      items: arr
    };
  }).sort((a, b) => b.value - a.value);
  return { total: list.length, value: locations.reduce((n, l) => n + l.value, 0), pricesAt: priceCache.at, locations };
}

function clearCaches() {
  responseCache.clear();
}

module.exports = {
  marketPrices, typeIdsByName, skillInfo,
  get, getAllPages, safe, ok, rawRequest,
  getAccessToken, serverStatus, overview, skillQueue, skills, wallet, mailList, mailBody,
  contracts, clones, industry, orders, assets, clearCaches, resolveNames
};
