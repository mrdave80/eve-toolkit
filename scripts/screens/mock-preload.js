// Screenshot-only preload: fake API with sample (fictional) pilot data.
const { contextBridge } = require('electron');
const H = 3600e3, D = 24 * H, now = Date.now();
const iso = t => new Date(t).toISOString();
const chars = [
  { id: 2119000001, name: 'Richard Fitzwell', needsReauth: false, missingScopes: [], isDirector: true },
  { id: 2119000002, name: 'Mike Hunt', needsReauth: false, missingScopes: [] },
  { id: 2119000003, name: 'Hugh Jayness', needsReauth: false, missingScopes: [] },
  { id: 2119000004, name: 'Wayne Kerr', needsReauth: false, missingScopes: [] },
  { id: 2119000005, name: 'Jack Mehoff', needsReauth: false, missingScopes: [] }
];
const ov = {
  2119000001: { name: 'Richard Fitzwell', corporation: 'Deep Pockets Salvage', alliance: 'Loose Cannons Coalition', securityStatus: 3.42, birthday: '2014-06-03T00:00:00Z',
    totalSp: 128450210, unallocatedSp: 0, wallet: 4823117450.27, system: 'Jita', docked: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    ship: { type: 'Ishtar', typeId: 12005, name: 'Reef Runner' }, online: { online: true, last_login: iso(now - 2 * H) },
    training: { skill: 'Drone Interfacing', level: 5, start: iso(now - 3 * D), finish: iso(now + 5 * D + 7 * H), levelStartSp: 512000, levelEndSp: 2048000, trainingStartSp: 512000 },
    paused: false, queueLength: 7, queueEnd: iso(now + 23 * D + 4 * H), errors: [] },
  2119000002: { name: 'Mike Hunt', corporation: 'Hard Rock Excavations', alliance: null, securityStatus: 5.0, birthday: '2019-11-20T00:00:00Z',
    totalSp: 46210980, unallocatedSp: 250000, wallet: 912450300.5, system: 'Amarr', docked: 'Amarr VIII (Oris) - Emperor Family Academy',
    ship: { type: 'Hulk', typeId: 22544, name: 'Ore Hound' }, online: { online: false, last_login: iso(now - 9 * H) },
    training: { skill: 'Exhumers', level: 4, start: iso(now - 20 * H), finish: iso(now + 14 * H + 22 * 60e3), levelStartSp: 181020, levelEndSp: 1024000, trainingStartSp: 600000 },
    paused: false, queueLength: 1, queueEnd: iso(now + 14 * H + 22 * 60e3), errors: [] },
  2119000003: { name: 'Hugh Jayness', corporation: 'Late Night Freight Co.', alliance: 'Loose Cannons Coalition', securityStatus: -1.8, birthday: '2022-02-14T00:00:00Z',
    totalSp: 12800440, unallocatedSp: 0, wallet: 38220150, system: 'Perimeter', docked: null,
    ship: { type: 'Viator', typeId: 12743, name: 'Late Night Freight' }, online: { online: false, last_login: iso(now - 3 * D) },
    training: null, paused: false, queueLength: 0, queueEnd: null, errors: [] },
  2119000004: { name: 'Wayne Kerr', corporation: 'Deep Pockets Salvage', alliance: 'Loose Cannons Coalition', securityStatus: -4.6, birthday: '2016-09-09T00:00:00Z',
    totalSp: 88400120, unallocatedSp: 0, wallet: 2150330000, system: 'Kedama', docked: null,
    ship: { type: 'Sabre', typeId: 22456, name: 'Bubble Trouble' }, online: { online: true, last_login: iso(now - 40 * 60e3) },
    training: { skill: 'Interdictors', level: 5, start: iso(now - 2 * D), finish: iso(now + 3 * D + 2 * H), levelStartSp: 362039, levelEndSp: 2048000, trainingStartSp: 362039 },
    paused: false, queueLength: 3, queueEnd: iso(now + 11 * D), errors: [] },
  2119000005: { name: 'Jack Mehoff', corporation: 'Hard Rock Excavations', alliance: null, securityStatus: 2.1, birthday: '2023-05-01T00:00:00Z',
    totalSp: 21900800, unallocatedSp: 500000, wallet: 310050000, system: 'Uedama', docked: null,
    ship: { type: 'Charon', typeId: 20185, name: 'Fragile Cargo' }, online: { online: false, last_login: iso(now - 7 * H) },
    training: { skill: 'Freighter', level: 4, start: iso(now - 10 * H), finish: iso(now + 6 * H), levelStartSp: 90510, levelEndSp: 512000, trainingStartSp: 300000 },
    paused: false, queueLength: 1, queueEnd: iso(now + 6 * H), errors: [] }
};
const q = [
  ['Drone Interfacing', 5, 3 * D, 5 * D + 7 * H, 512000, 2048000],
  ['Heavy Drone Operation', 5, 5 * D + 7 * H, 9 * D + 2 * H, 1280000, 1280000 * 5.6],
  ['Gallente Cruiser', 5, 0, 4 * D, 0, 0],
  ['Armor Layering', 4, 0, 1 * D + 6 * H, 0, 0],
  ['Thermodynamics', 4, 0, 18 * H, 0, 0],
  ['Capacitor Systems Operation', 5, 0, 2 * D + 3 * H, 0, 0],
  ['Signature Analysis', 5, 0, 1 * D + 10 * H, 0, 0]
];
let t = now - 3 * D;
const queue = q.map((e, i) => {
  const start = i === 0 ? now - 3 * D : t; const fin = i === 0 ? now + 5 * D + 7 * H : start + e[3];
  t = fin;
  return { queue_position: i, name: e[0], skill_id: 1000 + i, finished_level: e[1], start_date: iso(start), finish_date: iso(fin),
    level_start_sp: 256000 * (e[1] - 1), level_end_sp: 256000 * (e[1] - 1) + 512000 + i * 90000, training_start_sp: 256000 * (e[1] - 1) };
});
const groups = [
  ['Drones', [['Drones', 5, 5], ['Light Drone Operation', 5, 5], ['Medium Drone Operation', 5, 5], ['Heavy Drone Operation', 4, 4], ['Drone Interfacing', 4, 4], ['Drone Navigation', 4, 4], ['Drone Sharpshooting', 5, 5], ['Drone Durability', 3, 3]]],
  ['Engineering', [['Power Grid Management', 5, 5], ['CPU Management', 5, 5], ['Capacitor Management', 5, 5], ['Capacitor Systems Operation', 4, 4], ['Thermodynamics', 3, 3]]],
  ['Navigation', [['Navigation', 5, 5], ['Evasive Maneuvering', 4, 4], ['Warp Drive Operation', 5, 5], ['High Speed Maneuvering', 4, 4]]],
  ['Spaceship Command', [['Spaceship Command', 5, 5], ['Gallente Frigate', 5, 5], ['Gallente Cruiser', 4, 4], ['Heavy Assault Cruisers', 4, 4], ['Gallente Battleship', 3, 3]]],
  ['Shields', [['Shield Management', 4, 4], ['Shield Operation', 4, 4], ['Shield Upgrades', 3, 3]]]
].map(([name, sk]) => ({ name, count: sk.length, total: sk.length + 6, sp: sk.length * 1.9e6, skills: sk.map(([n, l, a], i) => ({ id: i, name: n, level: l, active: a, sp: 256000 * l })) }));
const refs = ['bounty_prizes', 'market_transaction', 'player_donation', 'market_escrow', 'transaction_tax', 'agent_mission_reward', 'brokers_fee', 'bounty_prizes'];
let bal = 4823117450.27;
const journal = Array.from({ length: 40 }, (_, i) => {
  const ref = refs[i % refs.length];
  const amt = ref.includes('tax') || ref.includes('fee') || ref === 'market_escrow' ? -(Math.round(Math.random() * 9e6)) : Math.round(Math.random() * 6e7);
  const row = { date: iso(now - i * 5.3 * H), ref_type: ref, amount: amt, balance: bal, description: ref === 'bounty_prizes' ? 'Richard Fitzwell got bounty prizes for killing pirates in Ostingele' : humanRef(ref) };
  bal -= amt; return row;
});
function humanRef(r) { return { market_transaction: 'Market: Richard Fitzwell sold stuff', player_donation: 'Mike Hunt deposited cash into Richard Fitzwell\'s account', market_escrow: 'Market escrow release', transaction_tax: 'Sales tax', agent_mission_reward: 'Mission reward', brokers_fee: 'Brokers fee' }[r] || r; }
const items = ['Hammerhead II', 'Ogre II', 'Nanite Repair Paste', 'Large Armor Repairer II', 'Antimatter Charge M', 'Medium Ancillary Current Router II', 'Damage Control II', '10MN Afterburner II'];
const tx = items.map((n, i) => ({ date: iso(now - i * 9 * H), type_id: 2000 + i, typeName: n, quantity: (i + 1) * 12, unit_price: 150000 * (i + 1.3), is_buy: i % 3 === 0, clientName: ['Paige Turner', 'Rob Banks', 'Carrie Oakey'][i % 3], locationName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' }));
const mails = [
  ['Mike Hunt', 'Moon mining schedule for next week', false, 1],
  ['Loose Cannons Coalition', 'CTA: Sunday fleet 0900 EVE time', false, 3],
  ['Hugh Jayness', 'Re: Freight run to Perimeter', true, 10],
  ['Deep Pockets Salvage', 'Monthly corp tax summary', true, 30],
  ['Bill Board', 'WTB Ishtar fits', true, 52],
  ['CONCORD', 'Your contract has been completed', true, 77]
].map(([f, s, r, h], i) => ({ mail_id: 500 + i, fromName: f, subject: s, is_read: r, timestamp: iso(now - h * H), from: 1 }));
const contracts = [
  { type: 'item_exchange', title: 'Ishtar - full fit, drones incl.', status: 'outstanding', issuer_id: 2119000001, issuerName: 'Richard Fitzwell', assigneeName: null, price: 410000000, date_expired: iso(now + 9 * D), startName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', availability: 'public' },
  { type: 'courier', title: 'Ore haul', status: 'in_progress', issuer_id: 2119000002, issuerName: 'Mike Hunt', acceptorName: 'Hugh Jayness', reward: 18000000, collateral: 600000000, date_expired: iso(now + 2 * D), startName: 'Amarr VIII (Oris)', endName: 'Jita IV - Moon 4', availability: 'personal' },
  { type: 'item_exchange', title: 'PLEX x 500', status: 'outstanding', issuer_id: 2119000001, issuerName: 'Richard Fitzwell', price: 2210000000, date_expired: iso(now + 13 * D), startName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', availability: 'public' }
];
const MOCK_SETTINGS = { onboardingDone: true, clientId: '3f1c0a9e2b7d4c51a8e6f0b2d9c4e7a1', callbackPort: 51515, notifications: true, minimizeToTray: true, refreshMinutes: 15, theme: process.env.MOCK_THEME || 'capsuleer' };
const api = {
  info: async () => ({ ok: true, data: { version: '1.10.0', os: 'Windows 11 Pro (10.0.26100)', electron: '38.8.6', userData: 'C:\\Users\\Capsuleer\\AppData\\Roaming\\EVE Toolkit', scopes: [] } }),
  getSettings: async () => ({ ok: true, data: { ...MOCK_SETTINGS } }),
  setSettings: async p => { Object.assign(MOCK_SETTINGS, p, p.themeAuto ? { themeAuto: { ...(MOCK_SETTINGS.themeAuto || {}), ...p.themeAuto } } : {}); return { ok: true, data: { ...MOCK_SETTINGS } }; },
  listCharacters: async () => ({ ok: true, data: chars }),
  addCharacter: async () => ({ ok: false, error: 'demo' }),
  removeCharacter: async () => ({ ok: true, data: chars }),
  reorderCharacters: async () => ({ ok: true, data: chars }),
  status: async () => ({ ok: true, data: { players: 24318 } }),
  overview: async id => ({ ok: true, data: { id, ...ov[id] } }),
  skillQueue: async () => ({ ok: true, data: { attributes: { intelligence: 27, memory: 21, perception: 24, willpower: 20, charisma: 19, bonus_remaps: 1 }, queue } }),
  skills: async () => ({ ok: true, data: { totalSp: 128450210, unallocatedSp: 0, groups } }),
  wallet: async () => ({ ok: true, data: { balance: 4823117450.27, journal, transactions: tx } }),
  mail: async () => ({ ok: true, data: { unread: 2, mails } }),
  mailBody: async (_c, id) => ({ ok: true, data: { ...mails.find(m => m.mail_id === id), recipientNames: ['Richard Fitzwell', 'Hugh Jayness'],
    body: 'Hey team,<br><br>Athanor in our home system pops on Tuesday downtime +2h. Bring Hulks and an Orca for boosts.<br><br>Target: 40k m3 per pilot. Ore buyback at 92% Jita.<br><br>Fly safe,<br>Mike' } }),
  contracts: async () => ({ ok: true, data: contracts }),
  clones: async () => ({ ok: true, data: { home: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', lastJump: iso(now - 30 * H), activeImplants: ['Ocular Filter - Basic', 'Memory Augmentation - Standard', 'Inherent Implants \'Noble\' Repair Systems RS-605'], jumpClones: [
    { name: 'Nullsec PvP', location: '1DQ1-A - Keepstar', implants: [] },
    { name: null, location: 'Amarr VIII (Oris) - Emperor Family Academy', implants: ['Michi\'s Excavation Augmentor', 'Inherent Implants \'Highwall\' Mining MX-1005'] }] } }),
  industry: async () => ({ ok: true, data: [
    { activity: 'Manufacturing', blueprint_type_id: 1, blueprint: 'Hammerhead II Blueprint', product: 'Hammerhead II', runs: 50, facility: 'Perimeter - Tranquility Trading Tower', status: 'active', end_date: iso(now + 6 * H + 12 * 60e3) },
    { activity: 'Invention', blueprint_type_id: 2, blueprint: 'Ogre I Blueprint', product: 'Ogre II Blueprint', runs: 10, facility: 'Perimeter - Tranquility Trading Tower', status: 'active', end_date: iso(now - 2 * H) },
    { activity: 'ME Research', blueprint_type_id: 3, blueprint: 'Ishtar Blueprint', product: null, runs: 1, facility: 'Jita IV - Moon 4', status: 'delivered', end_date: iso(now - 3 * D) }] }),
  orders: async () => ({ ok: true, data: items.slice(0, 6).map((n, i) => ({ type_id: i, typeName: n, is_buy_order: i > 3, price: 1.2e6 * (i + 1), volume_remain: 40 - i * 3, volume_total: 50, escrow: i > 3 ? 2e7 : 0, issued: iso(now - i * D), duration: 90, locationName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' })) }),
  assets: async () => ({ ok: true, data: { total: 1843, value: 9.42e9, pricesAt: now, locations: [
    { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', itemCount: 1200, value: 7.1e9, items: [['Ishtar', 1, 3.2e8], ['PLEX', 500, 4.4e6], ...items.map((n, i) => [n, (i + 1) * 37, 9e5 / (i + 1)])].map(([n, q, u], i) => ({ typeId: i, name: n, quantity: q, unitPrice: u, value: q * u })) },
    { name: 'Amarr VIII (Oris) - Emperor Family Academy', itemCount: 400, value: 1.9e9, items: [] }, { name: 'Perimeter - Tranquility Trading Tower', itemCount: 243, value: 4.2e8, items: [] }] } }),
  clearCache: async () => ({ ok: true }),
  openLink: async () => ({ ok: true }),
  onOverviewUpdate: () => {}
};

// ---------- extended mock data ----------
const tq = (id) => {
  const base = ov[id];
  const qq = id === 2119000001 ? queue : id === 2119000004 ? [{ queue_position: 0, name: 'Interdictors', skill_id: 2, finished_level: 5, start_date: iso(now - 2 * D), finish_date: iso(now + 3 * D + 2 * H), level_start_sp: 362039, level_end_sp: 2048000, training_start_sp: 362039 }] : id === 2119000005 ? [{ queue_position: 0, name: 'Freighter', skill_id: 3, finished_level: 4, start_date: iso(now - 10 * H), finish_date: iso(now + 6 * H), level_start_sp: 90510, level_end_sp: 512000, training_start_sp: 300000 }] : id === 2119000002 ? [{ queue_position: 0, name: 'Exhumers', skill_id: 1, finished_level: 4, start_date: iso(now - 20 * H), finish_date: iso(now + 14 * H + 22 * 60e3), level_start_sp: 181020, level_end_sp: 1024000, training_start_sp: 600000 }] : [];
  const q2 = qq.map(e => {
    const st = Date.parse(e.start_date), fi = Date.parse(e.finish_date);
    const spToGo = e.level_end_sp - e.training_start_sp;
    return { skillId: e.skill_id, name: e.name, level: e.finished_level, position: e.queue_position, start: e.start_date, finish: e.finish_date,
      spToGo, spPerHour: spToGo / ((fi - st) / H), spDone: Math.max(0, spToGo * (now - st) / (fi - st)), complete: false };
  });
  const rate = q2[0] ? q2[0].spPerHour : 0;
  const rem = q2.reduce((n, e) => n + e.spToGo - e.spDone, 0);
  return { totalSp: base.totalSp, unallocatedSp: base.unallocatedSp, spPerHour: rate, spPerDay: rate * 24, spRemaining: rem, projectedSp: base.totalSp + rem,
    queueEnd: base.queueEnd, paused: false, finishing24h: q2.filter(e => Date.parse(e.finish) - now < D).length, finishing7d: q2.filter(e => Date.parse(e.finish) - now < 7 * D).length,
    skillCount: 312, levelDist: [0, 14, 22, 61, 98, 117], attributes: { intelligence: 27, memory: 21, perception: 24, willpower: 20, charisma: 19, bonus_remaps: 1, last_remap_date: '2026-03-02T00:00:00Z' },
    implants: [{ name: 'Ocular Filter - Basic' }, { name: 'Memory Augmentation - Standard' }], queue: q2 };
};
const mkJob = (o) => ({ corp: false, successfulRuns: null, probability: null, installer: 'Richard Fitzwell', completed: null, ...o,
  progress: Math.max(0, Math.min(1, (now - Date.parse(o.start)) / (Date.parse(o.end) - Date.parse(o.start)))) });
const jobsFor = {
  2119000001: [
    mkJob({ jobId: 1, activity: 'Manufacturing', slot: 'manufacturing', status: 'ready', blueprintTypeId: 11, blueprint: 'Hammerhead II Blueprint', product: 'Hammerhead II', runs: 50, facility: 'Perimeter - Tranquility Trading Tower', start: iso(now - 30 * H), end: iso(now - 1 * H) }),
    mkJob({ jobId: 2, activity: 'Manufacturing', slot: 'manufacturing', status: 'active', blueprintTypeId: 12, blueprint: 'Ogre II Blueprint', product: 'Ogre II', runs: 20, facility: 'Perimeter - Tranquility Trading Tower', start: iso(now - 10 * H), end: iso(now + 16 * H) }),
    mkJob({ jobId: 3, activity: 'Manufacturing', slot: 'manufacturing', status: 'active', blueprintTypeId: 13, blueprint: 'Large Armor Repairer II Blueprint', product: 'Large Armor Repairer II', runs: 10, facility: 'Perimeter - Tranquility Trading Tower', start: iso(now - 2 * D), end: iso(now + 3 * D) }),
    mkJob({ jobId: 4, activity: 'Invention', slot: 'science', status: 'active', blueprintTypeId: 14, blueprint: 'Hobgoblin I Blueprint', product: 'Hobgoblin II Blueprint', runs: 10, probability: 0.42, facility: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', start: iso(now - 5 * H), end: iso(now + 9 * H) }),
    mkJob({ jobId: 5, activity: 'ME Research', slot: 'science', status: 'active', blueprintTypeId: 15, blueprint: 'Ishtar Blueprint', product: null, runs: 2, facility: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', start: iso(now - 4 * D), end: iso(now + 6 * D) }),
    mkJob({ jobId: 6, activity: 'Copying', slot: 'science', status: 'active', blueprintTypeId: 16, blueprint: 'Hammerhead I Blueprint', product: 'Hammerhead I Blueprint', runs: 10, facility: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', start: iso(now - 1 * D), end: iso(now + 2 * D + 5 * H) }),
    mkJob({ jobId: 7, activity: 'Invention', slot: 'science', status: 'delivered', blueprintTypeId: 17, blueprint: 'Ogre I Blueprint', product: 'Ogre II Blueprint', runs: 10, successfulRuns: 4, facility: 'Jita IV - Moon 4', start: iso(now - 6 * D), end: iso(now - 5 * D), completed: iso(now - 5 * D) }),
    mkJob({ jobId: 8, corp: true, installer: 'Doug Graves', activity: 'Reactions', slot: 'reaction', status: 'active', blueprintTypeId: 18, blueprint: 'Caesarium Cadmide Reaction Formula', product: 'Caesarium Cadmide', runs: 40, facility: 'Home - Tatara', start: iso(now - D), end: iso(now + 2 * D) })
  ],
  2119000002: [
    mkJob({ jobId: 21, installer: 'Mike Hunt', activity: 'Reactions', slot: 'reaction', status: 'active', blueprintTypeId: 19, blueprint: 'Fullerides Reaction Formula', product: 'Fullerides', runs: 60, facility: 'Home - Tatara', start: iso(now - 12 * H), end: iso(now + 1 * D + 18 * H) }),
    mkJob({ jobId: 22, installer: 'Mike Hunt', activity: 'TE Research', slot: 'science', status: 'active', blueprintTypeId: 20, blueprint: 'Mining Laser Upgrade II Blueprint', product: null, runs: 3, facility: 'Amarr VIII (Oris)', start: iso(now - D), end: iso(now + 4 * H) })
  ],
  2119000003: [],
  2119000004: [],
  2119000005: []
};
const slotsFor = { 2119000001: { manufacturing: { used: 3, max: 11 }, science: { used: 3, max: 11 }, reaction: { used: 0, max: 1 } },
  2119000002: { manufacturing: { used: 0, max: 6 }, science: { used: 1, max: 6 }, reaction: { used: 1, max: 9 } },
  2119000003: { manufacturing: { used: 0, max: 1 }, science: { used: 0, max: 1 }, reaction: { used: 0, max: 1 } },
  2119000004: { manufacturing: { used: 0, max: 1 }, science: { used: 0, max: 1 }, reaction: { used: 0, max: 1 } },
  2119000005: { manufacturing: { used: 0, max: 2 }, science: { used: 0, max: 1 }, reaction: { used: 0, max: 1 } } };
const ext = (product, tid, hoursLeft, per) => ({ product, productTypeId: tid, heads: 10, qtyPerCycle: per, cycleHours: 2, perHour: per / 2, installed: iso(now - (72 * H - hoursLeft * H)), expiry: hoursLeft === null ? null : iso(now + hoursLeft * H), expired: hoursLeft !== null && hoursLeft <= 0 });
const planetsFor = {
  2119000001: { maxPlanets: 6, ccUpgrades: 5, planets: [
    { planetId: 1, name: 'Ostingele VII', type: 'barren', system: 'Ostingele', upgradeLevel: 5, pins: 23, extractors: [ext('Base Metals', 31, 5.5, 9800), ext('Noble Metals', 32, 5.5, 8400)], factories: Array(6).fill({ schematic: 'Reactive Metals' }).concat(Array(4).fill({ schematic: 'Precious Metals' })), storage: [{ facility: 'Barren Launchpad', items: [{ name: 'Reactive Metals', typeId: 33, amount: 48200 }, { name: 'Precious Metals', typeId: 34, amount: 31950 }] }], nextExpiry: iso(now + 5.5 * H) },
    { planetId: 2, name: 'Ostingele II', type: 'lava', system: 'Ostingele', upgradeLevel: 5, pins: 19, extractors: [ext('Felsic Magma', 35, -3, 7600)], factories: Array(8).fill({ schematic: 'Silicon' }), storage: [], nextExpiry: iso(now - 3 * H), anyExpired: true },
    { planetId: 3, name: 'Tama IV', type: 'gas', system: 'Tama', upgradeLevel: 4, pins: 17, extractors: [ext('Aqueous Liquids', 36, 51, 6900), ext('Ionic Solutions', 37, 51, 6100)], factories: Array(5).fill({ schematic: 'Water' }), storage: [], nextExpiry: iso(now + 51 * H) }
  ] },
  2119000002: { maxPlanets: 4, ccUpgrades: 4, planets: [
    { planetId: 4, name: 'Amarr III', type: 'temperate', system: 'Amarr', upgradeLevel: 4, pins: 15, extractors: [ext('Carbon Compounds', 38, 20, 7200)], factories: Array(4).fill({ schematic: 'Biofuels' }), storage: [], nextExpiry: iso(now + 20 * H) }
  ] },
  2119000003: { maxPlanets: 1, ccUpgrades: 0, planets: [] },
  2119000004: { maxPlanets: 1, ccUpgrades: 0, planets: [] },
  2119000005: { maxPlanets: 1, ccUpgrades: 0, planets: [] }
};
Object.values(planetsFor).forEach(x => x.planets.forEach(p => { p.anyExpired = p.extractors.some(e => e.expired); p.launchpads = 1; }));
const bps = [['Hammerhead II Blueprint', 0, 4, 10, true], ['Ishtar Blueprint', 8, 16, -1, false], ['Hammerhead I Blueprint', 10, 20, -1, false], ['Ogre I Blueprint', 10, 20, -1, false], ['Ogre II Blueprint', 2, 4, 10, true], ['Large Armor Repairer I Blueprint', 10, 18, -1, false], ['Hobgoblin I Blueprint', 10, 20, -1, false], ['Damage Control II Blueprint', 2, 4, 5, true]]
  .map(([n, me, te, runs, copy], i) => ({ itemId: i, typeId: 40 + i, name: n, me, te, original: !copy, copy, runs, quantity: 1, location: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' }));
const miningDays = Array.from({ length: 30 }, (_, i) => ({ date: new Date(now - (29 - i) * D).toISOString().slice(0, 10), quantity: Math.round((i % 7 === 5 || i % 7 === 6 ? 120000 : 40000) * (0.6 + ((i * 37) % 10) / 10)) }));
Object.assign(api, {
  training: async id => ({ ok: true, data: tq(id) }),
  industryFull: async id => ({ ok: true, data: { slots: slotsFor[id], skills: { industry: 5, advancedIndustry: 5, massProduction: 5, advMassProduction: 5, labOperation: 5, advLabOperation: 5, massReactions: 0, advMassReactions: 0 }, corpError: null, jobs: jobsFor[id] } }),
  planets: async id => ({ ok: true, data: planetsFor[id] }),
  blueprints: async () => ({ ok: true, data: bps }),
  mining: async () => ({ ok: true, data: { total: miningDays.reduce((n, x) => n + x.quantity, 0), days: miningDays,
    ores: [{ name: 'Bitumens', typeId: 50, quantity: 1520000 }, { name: 'Coesite', typeId: 51, quantity: 880000 }, { name: 'Zeolites', typeId: 52, quantity: 410000 }],
    systems: [{ name: 'Ostingele', quantity: 2400000 }, { name: 'Tama', quantity: 410000 }],
    entries: miningDays.slice().reverse().map(d => ({ date: d.date, ore: 'Bitumens', typeId: 50, system: 'Ostingele', quantity: d.quantity })) } }),
  research: async () => ({ ok: true, data: [{ agent: 'Justin Case', agentId: 3010001, field: 'Mechanical Engineering', pointsPerDay: 84.2, startedAt: '2026-04-01T00:00:00Z', points: 18920 }, { agent: 'Paddy OFurniture', agentId: 3010002, field: 'Electronic Engineering', pointsPerDay: 61.5, startedAt: '2026-06-11T00:00:00Z', points: 9810 }] }),
  loyalty: async () => ({ ok: true, data: [{ corporationId: 1000035, corporation: 'Caldari Navy', points: 1840200 }, { corporationId: 1000180, corporation: 'State Protectorate', points: 412000 }] }),
  ordersFull: async () => { const o = (await api.orders()).data; return { ok: true, data: { maxOrders: 305, open: o, history: o.map((x, i) => ({ ...x, state: ['expired', 'cancelled', 'expired'][i % 3], volume_remain: 0 })) } }; },
  notifications: async () => ({ ok: true, data: [
    { id: 1, typeLabel: 'Structure Under Attack', sender: 'EVE', timestamp: iso(now - 2 * H), isRead: false, text: 'solarsystemID: 30000142\nstructureID: 1035466617946\nshieldPercentage: 72.4' },
    { id: 2, typeLabel: 'Corp All Bill Msg', sender: 'Deep Pockets Salvage', timestamp: iso(now - 9 * H), isRead: false, text: 'amount: 25000000\ndueDate: 134070624000000000' },
    { id: 3, typeLabel: 'Kill Report Victim', sender: 'EVE', timestamp: iso(now - 30 * H), isRead: true, text: 'killMailID: 12345' },
    { id: 4, typeLabel: 'Skill Injector Used', sender: 'EVE', timestamp: iso(now - 70 * H), isRead: true, text: '' },
    { id: 5, typeLabel: 'Contract Completed', sender: 'Hugh Jayness', timestamp: iso(now - 4 * D), isRead: true, text: '' }] }),
  calendar: async () => ({ ok: true, data: [{ id: 1, date: iso(now + 1 * D + 3 * H), title: 'Sunday strat-op: Tama', importance: 1, response: 'accepted', owner: 'Loose Cannons Coalition', duration: 120, text: 'Form up in Perimeter, doctrine Ishtars.' }, { id: 2, date: iso(now + 4 * D), title: 'Moon pop – Athanor', importance: 0, response: 'not_responded', owner: 'Hard Rock Excavations', duration: 60, text: '' }] }),
  corporation: async () => ({ ok: true, data: { corporationId: 98000001, corporation: { name: 'Deep Pockets Salvage', ticker: 'GCSC', members: 142, taxRate: 0.1, ceo: 'Seymour Butz', founded: '2015-02-01T00:00:00Z', home: 'Jita IV - Moon 4', war: true },
    alliance: { name: 'Loose Cannons Coalition', ticker: 'SDRFT' }, roles: ['factory_manager', 'station_manager', 'hangar_take_1'], titles: ['Industrialist'], fw: null,
    history: [{ corporation: 'Deep Pockets Salvage', corporationId: 98000001, start: '2019-05-01T00:00:00Z', end: null }, { corporation: 'Far Horizon Exploration', corporationId: 98000002, start: '2016-01-01T00:00:00Z', end: '2019-05-01T00:00:00Z' }, { corporation: 'State War Academy', corporationId: 1000167, start: '2014-06-03T00:00:00Z', end: '2016-01-01T00:00:00Z' }] } }),
  standings: async () => ({ ok: true, data: [{ name: 'Caldari State', type: 'faction', standing: 7.42 }, { name: 'Caldari Navy', type: 'npc_corp', standing: 8.9 }, { name: 'Gallente Federation', type: 'faction', standing: 2.1 }, { name: 'Guristas Pirates', type: 'faction', standing: -6.3 }, { name: 'Justin Case', type: 'agent', standing: 5.5 }] }),
  contacts: async () => ({ ok: true, data: [{ id: 1, name: 'Mike Hunt', type: 'character', standing: 10, watched: true, blocked: false, labels: ['Alts'] }, { id: 2, name: 'Seymour Butz', type: 'character', standing: 5, watched: true, blocked: false, labels: ['Corp'] }, { id: 3, name: 'Snuffed Out Rejects', type: 'corporation', standing: -10, watched: false, blocked: false, labels: ['Hostiles'] }] }),
  medals: async () => ({ ok: true, data: [{ title: 'Iron Hauler', description: 'Awarded for 1,000 courier contracts.', reason: 'Never lost a freighter', date: '2025-08-12T00:00:00Z', status: 'public', corporation: 'Deep Pockets Salvage', issuer: 'Seymour Butz' }] }),
  fatigue: async () => ({ ok: true, data: { fatigueExpires: iso(now + 2 * H + 14 * 60e3), lastJump: iso(now - 40 * 60e3), lastUpdate: iso(now - 40 * 60e3), cloneJumpHours: 20, nextCloneJump: null, maxJumpClones: 9 } }),
  killmails: async () => ({ ok: true, data: { kills: 14, losses: 2, list: [
    { id: 1, time: iso(now - 5 * H), loss: false, system: 'Tama', victim: 'Harry Pitts', victimCorp: 'The Badlands', ship: 'Vexor Navy Issue', shipTypeId: 60, attackers: 6, finalBlow: 'Richard Fitzwell', finalBlowShip: 'Ishtar', solo: false },
    { id: 2, time: iso(now - 26 * H), loss: true, system: 'Nourvukaiken', victim: 'Richard Fitzwell', victimCorp: 'Deep Pockets Salvage', ship: 'Ishtar', shipTypeId: 12005, attackers: 11, finalBlow: 'Ben Dover', finalBlowShip: 'Loki', solo: false },
    { id: 3, time: iso(now - 3 * D), loss: false, system: 'Kedama', victim: 'Neil Down', victimCorp: 'Snuffed Out Rejects', ship: 'Stiletto', shipTypeId: 61, attackers: 1, finalBlow: 'Richard Fitzwell', finalBlowShip: 'Ishtar', solo: true }] } }),
  fittings: async () => ({ ok: true, data: [
    { id: 1, name: 'Sentry Ishtar – L4s', description: 'Shield buffer, sentries', shipTypeId: 12005, ship: 'Ishtar', groups: [{ label: 'High slots', items: [{ name: 'Drone Link Augmentor II', typeId: 70, quantity: 1 }] }, { label: 'Mid slots', items: [{ name: 'Large Shield Extender II', typeId: 71, quantity: 1 }, { name: 'Omnidirectional Tracking Link II', typeId: 72, quantity: 1 }] }, { label: 'Low slots', items: [{ name: 'Drone Damage Amplifier II', typeId: 73, quantity: 1 }, { name: 'Damage Control II', typeId: 74, quantity: 1 }] }, { label: 'Drone bay', items: [{ name: 'Garde II', typeId: 75, quantity: 5 }, { name: 'Hammerhead II', typeId: 76, quantity: 5 }] }] },
    { id: 2, name: 'Max yield Hulk', description: '', shipTypeId: 22544, ship: 'Hulk', groups: [{ label: 'High slots', items: [{ name: 'Modulated Strip Miner II', typeId: 77, quantity: 1 }] }, { label: 'Low slots', items: [{ name: 'Mining Laser Upgrade II', typeId: 78, quantity: 1 }] }] }] }),
  contractItems: async () => ({ ok: true, data: [{ name: 'Ishtar', typeId: 12005, quantity: 1, included: true }, { name: 'Garde II', typeId: 75, quantity: 5, included: true }] })
});

// ---------- corp mock ----------
const memberNames = ['Richard Fitzwell', 'Mike Hunt', 'Hugh Jayness', 'Seymour Butz', 'Max Power', 'Lance Boyle', 'Ivana Tinkle', 'Barb Dwyer', 'Terry Bull', 'Sal Monella', 'Oliver Klozoff', 'Rusty Pipes', 'Tess Tickle', 'Lou Natic'];
const mList = memberNames.map((n, i) => ({ id: 2119000001 + i, name: n, lastLogon: iso(now - i * 2.7 * D), lastLogoff: iso(now - i * 2.7 * D + 2 * H), joined: iso(now - (400 - i * 25) * D),
  location: ['Jita IV - Moon 4', 'Tama - Home Fortizar', 'Amarr VIII (Oris)', 'Perimeter - TTT'][i % 4], ship: ['Ishtar', 'Hulk', 'Viator', 'Loki', 'Sabre', 'Orca'][i % 6], shipTypeId: 12005,
  roles: i === 0 ? ['Director'] : i === 3 ? ['Director', 'Accountant'] : i === 1 ? ['Station_Manager', 'Factory_Manager'] : [],
  titles: i < 2 ? ['Officer'] : i < 6 ? ['Member', 'FC'].slice(0, 1 + (i % 2)) : ['Member'],
  audit: i < 3 ? { source: 'live', at: now } : i < 9 ? { source: 'import', at: iso(now - i * 6 * D) } : null,
  discord: i < 10 ? '2841023918495' + i : null, inactiveDays: Math.floor(i * 2.7) }));
const wsData = {
  ops: [
    { id: 'op1', title: 'Sunday strat-op: Tama', type: 'Strat op', start: iso(now + 1 * D + 3 * H), fc: 'Max Power', doctrine: 'Sentry Ishtars', location: 'Perimeter', importance: 'high', description: 'Defend the Fortizar armor timer.' },
    { id: 'op2', title: 'Moon pop & mining fleet', type: 'Moon pop', start: iso(now + 3 * D + 1 * H), fc: 'Terry Bull', doctrine: 'Hulks + Orca', location: 'Ostingele', importance: 'normal' },
    { id: 'op3', title: 'Low-sec roam', type: 'Roam', start: iso(now + 5 * H), fc: 'Lance Boyle', doctrine: 'Kitey Vagabonds', location: 'Kedama', importance: 'normal' }],
  timers: [
    { id: 't1', structure: 'Tama – Home Fortizar', type: 'Fortizar', system: 'Tama', timerType: 'Armor', owner: 'Friendly', objective: 'Defend', time: iso(now + 1 * D + 3 * H + 20 * 60e3) },
    { id: 't2', structure: 'Snuffed Raitaru', type: 'Raitaru', system: 'Kedama', timerType: 'Hull', owner: 'Hostile', objective: 'Attack', time: iso(now + 9 * H) },
    { id: 't3', structure: 'Ostingele VII – Moon 1 Athanor', type: 'Athanor', system: 'Ostingele', timerType: 'Moon chunk', owner: 'Friendly', objective: 'Monitor', time: iso(now + 3 * D) }],
  fleets: Array.from({ length: 8 }, (_, i) => ({ id: 'f' + i, name: ['Home defense', 'Strat op', 'Roam', 'Mining'][i % 4], doctrine: ['Ishtars', 'Lokis', 'Vagas', 'Hulks'][i % 4], fcName: ['Max Power', 'Lance Boyle'][i % 2], fcId: 2119000004,
    startedAt: iso(now - (i * 4 + 1) * D), endedAt: iso(now - (i * 4 + 1) * D + 2 * H),
    participants: mList.slice(0, 12 - (i % 5)).filter((_, j) => (j + i) % 3 !== 0).map(p => ({ id: p.id, name: p.name, firstSeen: iso(now - (i * 4 + 1) * D), lastSeen: iso(now - (i * 4 + 1) * D + 2 * H), ships: ['Ishtar'], systems: ['Tama'], seenPolls: 100 })) })),
  srp: [
    { id: 's1', killmailId: 2, pilot: 'Richard Fitzwell', pilotId: 2119000001, ship: 'Ishtar', shipTypeId: 12005, system: 'Nourvukaiken', time: iso(now - 26 * H), lossValue: 412e6, hullValue: 320e6, payout: 412e6, fleet: 'Strat op', status: 'pending' },
    { id: 's2', killmailId: 5, pilot: 'Ivana Tinkle', pilotId: 2119000007, ship: 'Loki', shipTypeId: 61, system: 'Tama', time: iso(now - 3 * D), lossValue: 980e6, hullValue: 610e6, payout: 750e6, fleet: 'Home defense', status: 'approved', decisionNote: 'Capped at 750m' },
    { id: 's3', killmailId: 6, pilot: 'Rusty Pipes', pilotId: 2119000012, ship: 'Vagabond', shipTypeId: 62, system: 'Kedama', time: iso(now - 6 * D), lossValue: 210e6, hullValue: 180e6, payout: 210e6, fleet: '', status: 'pending' },
    { id: 's4', killmailId: 7, pilot: 'Terry Bull', pilotId: 2119000009, ship: 'Sabre', shipTypeId: 63, system: 'Tama', time: iso(now - 9 * D), lossValue: 95e6, hullValue: 70e6, payout: 95e6, fleet: 'Roam', status: 'paid' }],
  hr: [
    { id: 'h1', characterId: 2119000101, name: 'Polly Ester', corporation: 'State War Academy', alliance: null, birthday: '2025-09-01T00:00:00Z', securityStatus: 0.8, corpCount: 2, recruiter: 'Ivana Tinkle', status: 'interview', createdAt: iso(now - 2 * D),
      history: [{ corporation: 'State War Academy', start: '2025-11-01T00:00:00Z' }, { corporation: 'School of Applied Knowledge', start: '2025-09-01T00:00:00Z', end: '2025-11-01T00:00:00Z' }], notes: [{ at: iso(now - 2 * D), by: 'Ivana Tinkle', text: 'Came in via Reddit. Interested in moon mining & home defense.' }] },
    { id: 'h2', characterId: 2119000102, name: 'Mike Rotch', corporation: 'Far Horizon Exploration', alliance: 'The Badlands', birthday: '2017-03-11T00:00:00Z', securityStatus: -3.2, corpCount: 11, recruiter: 'Barb Dwyer', status: 'new', createdAt: iso(now - 5 * H), history: [], notes: [] }],
  srpRules: { percent: 100, includeFit: true, maxPayout: 750e6, shipOverrides: {} },
  audits: Object.fromEntries(mList.slice(3, 9).map((p, i) => [p.id, { format: 'eve-companion-audit', exportedAt: iso(now - (i + 3) * 6 * D), character: { id: p.id, name: p.name, corporation: 'Deep Pockets Salvage', securityStatus: 1.2 },
    summary: { totalSp: 40e6 + i * 11e6, wallet: 3e8 + i * 4e8, assetValue: 2e9 + i * 1.3e9, ship: p.ship, system: 'Tama', spPerHour: 2400 + i * 100, kills: 20 + i * 7, losses: i + 1, training: 'Logistics Cruisers V' },
    skills: [{ group: 'Spaceship Command', sp: 9e6, skills: [{ name: 'Heavy Assault Cruisers', level: 4 }, { name: 'Logistics Cruisers', level: 4 }] }], assets: [{ location: 'Jita IV - Moon 4', value: 1.2e9, items: 300, top: [{ name: 'PLEX', quantity: 100, value: 4.4e8 }] }], clones: { home: 'Tama Fortizar', jumpClones: [] }, history: [] }])),
  discord: { webhooks: { ops: 'https://discord.com/api/webhooks/1/x', timers: 'https://discord.com/api/webhooks/1/x', structures: 'https://discord.com/api/webhooks/1/x', srp: '', hr: '' }, hasBotToken: true, guildId: '998877665544332211', memberRoleId: '112233445566778899', allianceRoleId: '', titleRoles: {}, links: Object.fromEntries(mList.filter(p => p.discord).map(p => [p.id, p.discord])), syncEnabled: true, lastSync: iso(now - 3 * H), lastSyncResult: { added: 2, removed: 1, unchanged: 7, missing: 0, errors: [] }, fuelWarnDays: 3, alertStructures: true, remindOps: true }
};
const corpStructs = [
  { id: 1, name: 'Tama – Home Fortizar', type: 'Fortizar', typeId: 80, system: 'Tama', state: 'armor_reinforce', stateTimerEnd: iso(now + 1 * D + 3 * H + 20 * 60e3), fuelExpires: iso(now + 41 * D), fuelDays: 41, reinforceHour: 20, services: [{ name: 'Clone Bay', state: 'online' }, { name: 'Market Hub', state: 'online' }] },
  { id: 2, name: 'Ostingele VII – Moon 1 Athanor', type: 'Athanor', typeId: 81, system: 'Ostingele', state: 'shield_vulnerable', fuelExpires: iso(now + 2.2 * D), fuelDays: 2.2, reinforceHour: 21, services: [{ name: 'Moon Drilling', state: 'online' }, { name: 'Reprocessing', state: 'online' }] },
  { id: 3, name: 'Perimeter – Production Raitaru', type: 'Raitaru', typeId: 82, system: 'Perimeter', state: 'shield_vulnerable', fuelExpires: iso(now + 5.5 * D), fuelDays: 5.5, reinforceHour: 19, services: [{ name: 'Manufacturing (Standard)', state: 'online' }, { name: 'Invention', state: 'online' }] },
  { id: 4, name: 'Tama – Staging Astrahus', type: 'Astrahus', typeId: 83, system: 'Tama', state: 'low_power', fuelExpires: null, fuelDays: null, reinforceHour: 20, services: [{ name: 'Clone Bay', state: 'offline' }] }];
api.corp = {
  directors: async () => ({ ok: true, data: [{ id: 2119000001, name: 'Richard Fitzwell', corporationId: 98000001, allianceId: 99000001 }] }),
  overview: async () => ({ ok: true, data: { corporationId: 98000001, name: 'Deep Pockets Salvage', ticker: 'GCSC', memberCount: 142, taxRate: 0.1, ceo: 'Seymour Butz', founded: '2015-02-01T00:00:00Z',
    alliance: { name: 'Loose Cannons Coalition', ticker: 'SDRFT', corps: 6 }, allianceCorps: ['Deep Pockets Salvage', 'Hard Rock Excavations', 'Late Night Freight Co.', 'Rusty Bolt Industrial', 'Backwater Navy', 'Shady Harbour Capital'].map((n, i) => ({ id: 98000001 + i, name: n })),
    walletTotal: 38.42e9, structures: { count: 4, lowFuel: 2, noFuel: 1, reinforced: 1 } } }),
  members: async () => ({ ok: true, data: { corporationId: 98000001, limit: 1250, list: mList } }),
  structures: async () => ({ ok: true, data: { structures: corpStructs, starbases: [{ id: 1, type: 'Caldari Control Tower', typeId: 90, system: 'Tama', moon: 'Tama V - Moon 3', state: 'online', onlinedSince: '2023-01-04T00:00:00Z' }],
    customsOffices: [{ id: 1, system: 'Ostingele', reinforceExit: '18:00–20:00', allowAlliance: true, taxCorp: 0.05, taxAlliance: 0.08, standingLevel: 'good' }, { id: 2, system: 'Tama', reinforceExit: '19:00–21:00', allowAlliance: true, taxCorp: 0.05, taxAlliance: 0.08, standingLevel: 'neutral' }] } }),
  structureNotifications: async () => ({ ok: true, data: [
    { id: 91, typeLabel: 'Structure Lost Shields', type: 'StructureLostShields', timestamp: iso(now - 2 * H), system: 'Tama', structureType: 'Fortizar', timerEnd: iso(now + 1 * D + 3 * H + 20 * 60e3), canTimer: true, alert: true },
    { id: 92, typeLabel: 'Structure Under Attack', type: 'StructureUnderAttack', timestamp: iso(now - 3 * H), system: 'Tama', structureType: 'Fortizar', canTimer: false, alert: true },
    { id: 93, typeLabel: 'Structure Fuel Alert', type: 'StructureFuelAlert', timestamp: iso(now - 10 * H), system: 'Ostingele', structureType: 'Athanor', canTimer: false, alert: true }] }),
  moons: async () => ({ ok: true, data: { extractions: [
      { structure: 'Ostingele VII – Moon 1 Athanor', moon: 'Ostingele VII - Moon 1', start: iso(now - 12 * D), arrival: iso(now + 2 * D + 3 * H), decay: iso(now + 2 * D + 6 * H), ready: false },
      { structure: 'Tama V Tatara', moon: 'Tama V - Moon 2', start: iso(now - 20 * D), arrival: iso(now - 4 * H), decay: iso(now - 1 * H + 3 * H), ready: true },
      { structure: 'Kedama III Athanor', moon: 'Kedama III - Moon 4', start: iso(now - 2 * D), arrival: iso(now + 6 * D), decay: iso(now + 6 * D + 3 * H), ready: false }],
    observers: [{}, {}, {}], miners: mList.slice(0, 7).map((p, i) => ({ id: p.id, name: p.name, corp: 'Deep Pockets Salvage', quantity: 820000 - i * 90000, value: (820000 - i * 90000) * 410 })), ledgerTotal: 1.64e9 } }),
  wallets: async () => ({ ok: true, data: { division: 1, total: 38.42e9, divisions: ['Master Wallet', 'SRP Fund', 'Industry', 'Moon Tax', 'Buyback', 'Ops', 'Reserve'].map((n, i) => ({ division: i + 1, name: n, balance: [21e9, 6.2e9, 4.1e9, 3.3e9, 2.1e9, 0.9e9, 0.82e9][i] })),
    journal: journal.slice(0, 25).map(j => ({ ...j, firstParty: 'Deep Pockets Salvage', secondParty: 'Richard Fitzwell', ref_type: ['corporate_reward_payout', 'player_donation', 'bounty_prizes', 'structure_gate_jump'][Math.abs(j.amount) % 4] })) } }),
  contracts: async () => ({ ok: true, data: contracts.map((c, i) => ({ ...c, contract_id: i, date_expired: c.date_expired, issuerName: c.issuerName })) }),
  orders: async () => ({ ok: true, data: (await api.orders()).data.map(o => ({ ...o, issuedBy: 'Richard Fitzwell', wallet_division: 3 })) }),
  industry: async () => ({ ok: true, data: [...jobsFor[2119000001], ...jobsFor[2119000002]].map(j => ({ ...j, corp: true, installer: j.installer, pilot: j.installer })) }),
  assets: async () => ({ ok: true, data: { total: 48210, value: 214.7e9, locations: [{ name: 'Tama – Home Fortizar', value: 160e9, itemCount: 30000, items: [{ typeId: 1, name: 'Ishtar', quantity: 40, value: 12.8e9, divisionName: 'Doctrine Ships' }, { typeId: 2, name: 'Nanite Repair Paste', quantity: 90000, value: 2.7e9, divisionName: 'Fleet Supplies' }] }], blueprints: bps } }),
  killmails: async () => ({ ok: true, data: [
    { id: 1, time: iso(now - 5 * H), loss: false, system: 'Tama', victim: 'Harry Pitts', victimCorp: 'The Badlands', ship: 'Vexor Navy Issue', shipTypeId: 60, totalValue: 180e6, hullValue: 90e6, attackers: 6, corpAttackers: 5, finalBlow: 'Richard Fitzwell', finalBlowShip: 'Ishtar' },
    { id: 2, time: iso(now - 26 * H), loss: true, victimId: 2119000001, system: 'Nourvukaiken', victim: 'Richard Fitzwell', victimCorp: 'Deep Pockets Salvage', ship: 'Ishtar', shipTypeId: 12005, totalValue: 412e6, hullValue: 320e6, attackers: 11, finalBlow: 'Ben Dover', finalBlowShip: 'Loki' },
    { id: 8, time: iso(now - 30 * H), loss: true, victimId: 2119000011, system: 'Tama', victim: 'Oliver Klozoff', victimCorp: 'Deep Pockets Salvage', ship: 'Scimitar', shipTypeId: 64, totalValue: 290e6, hullValue: 220e6, attackers: 18, finalBlow: 'Mike Oxlong', finalBlowShip: 'Loki' },
    { id: 9, time: iso(now - 2 * D), loss: false, system: 'Kedama', victim: 'Snuffed Raitaru', victimCorp: 'Snuffed Out Rejects', ship: 'Raitaru', shipTypeId: 82, totalValue: 2.1e9, hullValue: 1.4e9, attackers: 34, corpAttackers: 22, finalBlow: 'Max Power', finalBlowShip: 'Loki' }] }),
  killmailByLink: async () => ({ ok: false, error: 'demo' }),
  lookupCharacter: async () => ({ ok: false, error: 'demo' })
};
api.ws = { get: async () => ({ ok: true, data: wsData }), upsert: async (c, i) => ({ ok: true, data: i }), remove: async () => ({ ok: true }), setSrpRules: async r => ({ ok: true, data: r }), exportFile: async () => ({ ok: true }), importFiles: async () => ({ ok: true }), removeAudit: async () => ({ ok: true }) };
let fleetLive = { id: null, fcId: 2119000001, fcName: 'Richard Fitzwell', name: 'Sunday strat-op: Tama', doctrine: 'Sentry Ishtars', startedAt: iso(now - 47 * 60e3), lastPoll: iso(now - 20e3), lastError: null, polls: 47,
  participants: mList.slice(0, 11).map((p, i) => ({ id: p.id, name: p.name, firstSeen: iso(now - 45 * 60e3), lastSeen: iso(now), seenPolls: 47 - i * 3, ships: [['Ishtar', 'Ishtar', 'Scimitar', 'Loki', 'Sabre'][i % 5]], systems: ['Tama'] })) };
api.fleet = { status: async () => ({ ok: true, data: fleetLive }), check: async () => ({ ok: true, data: {} }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }), onUpdate: () => {} };
api.discord = { set: async p => ({ ok: true, data: p }), test: async () => ({ ok: true, data: {} }), guild: async () => ({ ok: true, data: { name: 'x', roles: [] } }), link: async () => ({ ok: true, data: {} }), sync: async () => ({ ok: true, data: {} }) };
api.exportAudit = async () => ({ ok: true });
api.info = async () => ({ ok: true, data: { version: '1.10.0', os: 'Windows 11 Pro (10.0.26100)', electron: '38.8.6', userData: 'C:\\Users\\Capsuleer\\AppData\\Roaming\\EVE Toolkit', scopes: [], corpScopes: [] } });

// ---------- PI + skill info mock ----------
const tierPrice = [6, 450, 9000, 75000, 1300000];
api.pi = {
  types: async names => ({ ok: true, data: Object.fromEntries(names.map((n, i) => [n, { id: null, price: 0, _n: n }])) }),
  capacity: async () => ({ ok: true, data: [{ name: 'Richard Fitzwell', maxPlanets: 6 }, { name: 'Mike Hunt', maxPlanets: 4 }, { name: 'Hugh Jayness', maxPlanets: 1 }] }),
  current: async () => ({ ok: true, data: { extracting: { 'Base Metals': 9800, 'Noble Metals': 8400, 'Felsic Magma': 0, 'Aqueous Liquids': 6900, 'Ionic Solutions': 6100, 'Carbon Compounds': 7200 }, producing: { 'Reactive Metals': 6, 'Precious Metals': 4, 'Water': 5, 'Biofuels': 4 } } }),
  plans: async () => ({ ok: true, data: [] }), savePlan: async p => ({ ok: true, data: [p] }), deletePlan: async () => ({ ok: true, data: [] })
};
api.skillInfo = async () => ({ ok: true, data: { id: 1000, name: 'Drone Interfacing', rank: 5, primary: 'Intelligence', secondary: 'Memory', trainedLevel: 4, spInSkill: 226275,
  description: 'Allows a captain to better maintain control over drones. 10% bonus to drone damage and drone mining yield per level.',
  requires: [{ id: 1, name: 'Drones', level: 5, trained: 5 }, { id: 2, name: 'Scout Drone Operation', level: 1, trained: 5 }] } });

// ---------- wormhole mock ----------
const sysN = (id, name, cls, sec, region, x, y, extra = {}) => ({ id, name, cls, security: sec, region, wspace: /^C|Thera|C13/.test(cls), x, y, label: '', notes: '', sigs: [], ...extra });
const whMap = { id: 'm1', name: 'Home chain', homeId: 31000101, mapGates: false,
  systems: [
    sysN(31000101, 'J152701', 'C3', -1, 'C-R00012', 80, 230, { label: 'Home · static C5 + HS', sigs: [
      { id: 'ABC-123', group: 'Signature', type: 'Wormhole', name: 'Unstable Wormhole', strength: 100, firstSeen: iso(now - 3 * H), whType: 'D845', leadsTo: 'J204815' },
      { id: 'KLT-552', group: 'Signature', type: 'Wormhole', name: 'Unstable Wormhole', strength: 100, firstSeen: iso(now - 50 * 60e3), whType: 'D845', leadsTo: 'Hek' },
      { id: 'QWE-910', group: 'Signature', type: 'Gas', name: 'Vital Core Reservoir', strength: 100, firstSeen: iso(now - 8 * H) },
      { id: 'ZRX-338', group: 'Signature', type: 'Data', name: 'Unsecured Frontier Database', strength: 100, firstSeen: iso(now - 2 * H) },
      { id: 'MNB-004', group: 'Signature', type: '', name: '', strength: 14.2, firstSeen: iso(now - 4 * 60e3) },
      { id: 'HJK-771', group: 'Anomaly', type: 'Combat', name: 'Sleeper Data Sanctum', strength: 100, firstSeen: iso(now - 26 * H) }] }),
    sysN(31000202, 'J204815', 'C5', -1, 'E-R00026', 330, 110, { label: 'Static · sites cleared', sigs: [{ id: 'POI-221', group: 'Signature', type: 'Wormhole', name: '', strength: 100, firstSeen: iso(now - 2 * H) }] }),
    sysN(31000303, 'J095522', 'C2', -1, 'B-R00005', 330, 340, {}),
    sysN(30002053, 'Hek', 'HS', 0.5, 'Metropolis', 590, 30, {}),
    sysN(31000404, 'J160941', 'C6', -1, 'F-R00030', 590, 160, { label: 'Hostile · Rorq seen' }),
    sysN(30001234, 'Tama', 'LS', 0.3, 'The Citadel', 590, 330, {}),
    sysN(31000505, 'Thera', 'Thera', -1, 'G-R00031', 590, 450, {})
  ],
  connections: [
    { id: 'c1', from: 31000101, to: 31000202, type: 'D845', mass: 'stable', eol: false, size: 'XL', createdAt: iso(now - 3 * H), firstBy: 'Richard Fitzwell' },
    { id: 'c2', from: 31000101, to: 31000303, type: 'K162', mass: 'destab', eol: false, size: 'L', createdAt: iso(now - 9 * H) },
    { id: 'c3', from: 31000202, to: 30002053, type: 'D845', mass: 'stable', eol: true, eolAt: iso(now - 40 * 60e3), size: 'L', createdAt: iso(now - 15 * H) },
    { id: 'c4', from: 31000202, to: 31000404, type: 'K162', mass: 'crit', eol: false, size: 'XL', createdAt: iso(now - 50 * 60e3) },
    { id: 'c5', from: 31000303, to: 30001234, type: 'K162', mass: 'stable', eol: false, size: 'M', createdAt: iso(now - 5 * H) },
    { id: 'c6', from: 31000303, to: 31000505, type: 'K162', mass: 'stable', eol: false, size: 'L', createdAt: iso(now - 20 * H) }
  ] };
api.wh = {
  maps: async () => ({ ok: true, data: [whMap] }), exportMap: async () => ({ ok: true, data: { copied: true, chars: 1840, systems: 7 } }), importMap: async () => ({ ok: true, data: { canceled: true } }),
  info: async id => ({ ok: true, data: { id, name: 'J152701', cls: 'C3', region: 'C-R00012', effect: 'Wolf-Rayet', effectSummary: 'More armour HP, more small weapon damage and smaller signatures, but weaker shield resists.',
    statics: [{ code: 'H296', leadsTo: 'C5', lifeHours: 24, totalMass: 3e9, jumpMass: 1.35e9 }, { code: 'D845', leadsTo: 'HS', lifeHours: 24, totalMass: 5e9, jumpMass: 375e6 }], shattered: false, staticsKnown: true } }), op: async (m, o) => ({ ok: true, data: whMap }), system: async () => ({ ok: true, data: {} }),
  activity: async ids => ({ ok: true, data: { 31000404: { kills: { ship: 3, pod: 2, npc: 0 }, jumps: null }, 31000202: { kills: { ship: 0, pod: 0, npc: 212 }, jumps: null }, 30002053: { kills: { ship: 4, pod: 1, npc: 0 }, jumps: 1840 }, 30001234: { kills: { ship: 11, pod: 6, npc: 3 }, jumps: 620 } } }),
  routes: async () => ({ ok: true, data: { Jita: 13, Amarr: 22, Dodixie: 14, Rens: 6, Hek: 0 } }),
  track: async () => ({ ok: true }), untrack: async () => ({ ok: true }),
  status: async () => ({ ok: true, data: { active: true, mapId: 'm1', pilots: [2119000001, 2119000002], positions: { 2119000001: 31000202, 2119000002: 31000101 }, ships: {},
    shipNames: { 2119000001: 'Buzzard', 2119000002: 'Prospect' },
    log: [{ at: iso(now - 50 * 60e3), charName: 'Richard Fitzwell', fromName: 'J204815', toName: 'J160941', gate: false, mapped: true }, { at: iso(now - 53 * 60e3), charName: 'Richard Fitzwell', fromName: 'J160941', toName: 'J204815', gate: false }, { at: iso(now - 3 * H), charName: 'Richard Fitzwell', fromName: 'J152701', toName: 'J204815', gate: false, mapped: true }] } }),
  onEvent: () => {}
};

// ---------- 1.3 mock ----------
api.sde = { check: async () => ({ ok: true, data: globalThis.__sdeCheck || { state: 'ok', build: 3419624 } }), info: async () => ({ ok: true, data: { ready: true, state: 'ready', build: 3419624, builtAt: iso(now - 2 * D), counts: { types: 51234, blueprints: 5102, systems: 8437 } } }),
  search: async q => ({ ok: true, data: [{ id: 12005, name: 'Ishtar', group: 'Heavy Assault Cruiser', categoryId: 6 }, { id: 2, name: 'Ishtar Blueprint', group: 'Heavy Assault Cruiser Blueprint', categoryId: 9 }] }),
  type: async id => ({ ok: true, data: { id, name: 'Hammerhead II', group: 'Combat Drone', volume: 10 } }), update: async () => ({ ok: true }), importZip: async () => ({ ok: true }), wormholeTypes: async () => ({ ok: true, data: [] }), onStatus: () => {} };
const planRows = [['Drones', 5, 'Drones', 1, true], ['Drone Interfacing', 5, 'Drones', 5, false, 'queued'], ['Heavy Drone Operation', 5, 'Drones', 5], ['Drone Sharpshooting', 5, 'Drones', 2], ['Gallente Cruiser', 5, 'Spaceship Command', 5], ['Heavy Assault Cruisers', 5, 'Spaceship Command', 6], ['Armor Layering', 4, 'Armor', 3], ['Thermodynamics', 4, 'Engineering', 3], ['Sentry Drone Interfacing', 4, 'Drones', 5]];
let cum = 0;
api.plan = { list: async () => ({ ok: true, data: [{ id: 'p1', charId: 2119000001, name: 'Sentry Ishtar max', entries: planRows.map((r, i) => ({ skillId: i, level: r[1] })) }] }),
  compute: p => Promise.resolve({ ok: true, data: { plan: p, totalMinutes: 0, totalSp: 0, factor: 1.12, bonusRemaps: 1, nextRemap: iso(now + 120 * D), attributes: {},
    rows: planRows.map((r, i) => { const m = r[4] ? 0 : (r[3] * 3000 + i * 900); cum += m; return { index: i, skillId: i, name: r[0], level: r[1], group: r[2], rank: r[3], primary: 'intelligence', secondary: 'memory', sp: r[4] ? 0 : r[3] * 256000 * 0.7, minutes: m, cumulative: cum, trained: !!r[4], queued: r[5] === 'queued', prereqOk: true }; }) } }).then(x => { x.data.totalMinutes = cum; x.data.totalSp = 8.4e6; cum = 0; return x; }),
  save: async p => ({ ok: true, data: p }), remove: async () => ({ ok: true }), remap: async () => ({ ok: true, data: { current: { minutes: 90000, attributes: { intelligence: 27, memory: 21, perception: 24, willpower: 20, charisma: 19 } }, best: { minutes: 78000, attributes: { intelligence: 27, memory: 21, perception: 17, willpower: 17, charisma: 17 } }, savedMinutes: 12000 } }),
  addSkill: async p => ({ ok: true, data: p }), addType: async p => ({ ok: true, data: p }), importText: async p => ({ ok: true, data: { plan: p, unknown: [] } }), exportText: async () => ({ ok: true, data: '' }), skills: async () => ({ ok: true, data: {} }) };
api.canFly = async () => ({ ok: true, data: { type: { categoryId: 6 }, requirements: [{ name: 'Heavy Assault Cruisers', level: 4 }, { name: 'Gallente Cruiser', level: 5 }, { name: 'Drones', level: 5 }],
  pilots: [{ id: 2119000001, name: 'Richard Fitzwell', canFly: true, missing: [], minutes: 0 }, { id: 2119000002, name: 'Mike Hunt', canFly: false, missing: [{ name: 'Heavy Assault Cruisers', level: 4, have: 0 }, { name: 'Gallente Cruiser', level: 5, have: 3 }], minutes: 27 * 1440 },
    { id: 2119000003, name: 'Hugh Jayness', canFly: false, missing: [{ name: 'Gallente Cruiser', level: 5, have: 1 }], minutes: 61 * 1440 }, { id: 2119000006, name: 'Lance Boyle', canFly: true, missing: [], minutes: 0, fromAudit: true }] } });
api.ind = { structures: async () => ({ ok: true, data: { structures: { npc: { label: 'NPC station' }, raitaru: { label: 'Raitaru' }, azbel: { label: 'Azbel' }, sotiyo: { label: 'Sotiyo' }, athanor: { label: 'Athanor' }, tatara: { label: 'Tatara' } }, decryptors: { none: { label: 'No decryptor', prob: 1, runs: 0 } } } }),
  pilotSkills: async () => ({ ok: true, data: { industry: 5, advancedIndustry: 5, levels: {} } }),
  calc: async () => ({ ok: true, data: { product: { name: 'Hammerhead II' }, productTypeId: 2185, activity: 'manufacturing', blueprint: 'Hammerhead II Blueprint', runs: 10, outQty: 100, maxRuns: 10, seconds: 5.2 * 3600,
    materials: [['Morphite', 84, 0, 9800], ['Robotics', 9, 0, 120000], ['Sustained Shield Emitter', 10, 1, 41000], ['Hammerhead I', 100, 1, 21000], ['R.A.M.- Robotics', 10, 1, 9000]].map(([n, q, b, u], i) => ({ typeId: i, name: n, base: q / 10, qty: q, unit: u, buyCost: q * u, canBuild: !!b, built: i === 3 ? { totalCost: q * u * 0.7 } : null, cost: i === 3 ? q * u * 0.7 : q * u })),
    materialCost: 5.18e6, jobCost: 312000, eiv: 4.1e6, costIndex: 0.0418, totalCost: 5.49e6, unitCost: 54900, sellPrice: 81400, buyPrice: 74100, revenueSell: 8.14e6, revenueBuy: 7.41e6, profitSell: 2.65e6, profitBuy: 1.92e6, iskPerHour: 509000,
    skills: [{ id: 1, name: 'Industry', level: 1 }, { id: 2, name: 'Drone Interfacing', level: 1 }, { id: 3, name: 'Gallente Starship Engineering', level: 1 }, { id: 4, name: 'Mechanical Engineering', level: 1 }] } }),
  invent: async () => ({ ok: false, error: 'demo' }), reprocess: async () => ({ ok: false, error: 'demo' }) };
api.market = { hubs: async () => ({ ok: true, data: {} }), prices: async ids => ({ ok: true, data: Object.fromEntries(ids.map(i => [i, { sell: 81400, buy: 74100 }])) }),
  book: async () => ({ ok: true, data: { sell: 81400, buy: 74100, sellVolume: 48210, buyVolume: 21800, sells: [81400, 81450, 81900, 82000, 82990, 83500].map((p, i) => ({ price: p, volume: 1200 + i * 800 })), buys: [74100, 74000, 73500, 72000, 70100].map((p, i) => ({ price: p, volume: 2000 + i * 500, range: i ? 'region' : 'station' })) } }),
  history: async () => ({ ok: true, data: Array.from({ length: 180 }, (_, i) => { const a = 76000 + 6000 * Math.sin(i / 14) + i * 25; return { date: new Date(now - (179 - i) * D).toISOString().slice(0, 10), average: a, highest: a * 1.04, lowest: a * 0.96, volume: 9000 + (i * 37 % 11) * 900 }; }) }) };
api.nav = { systemId: async () => ({ ok: true, data: 30000144 }), pilotLocations: async () => ({ ok: true, data: [{ id: 2119000001, name: 'Richard Fitzwell', systemId: 30004759, system: '1DQ1-A', security: -0.38, whClass: 0, region: 'Delve', regionId: 10000060 }, { id: 2119000004, name: 'Wayne Kerr', systemId: 30004762, system: 'T5ZI-S', security: -0.21, whClass: 0, region: 'Delve', regionId: 10000060 }, { id: 2119000005, name: 'Jack Mehoff', systemId: 30004770, system: 'PR-8CN', security: -0.5, whClass: 0, region: 'Delve', regionId: 10000060 }] }), ships: async () => ({ ok: true, data: ['Carrier / Dreadnought / FAX'] }),
  route: async () => ({ ok: true, data: { jumps: 9, hs: 6, ls: 3, ns: 0, shortcuts: 1, from: { name: 'Jita' }, to: { name: 'Tama' }, path: [['Jita', 0.95, 'The Forge'], ['Perimeter', 0.96, 'The Forge'], ['Urlen', 0.97, 'The Forge'], ['Sirppala', 0.92, 'The Forge'], ['Inaro', 0.81, 'Kimotoro'], ['Kaaputenen', 0.6, 'The Forge'], ['Nennamaila', 0.47, 'The Citadel', 'thera'], ['Aokannitoh', 0.4, 'The Citadel'], ['Kedama', 0.33, 'The Citadel'], ['Tama', 0.3, 'The Citadel']].map(([n, sec, r, via], i) => ({ id: 30000100 + i, name: n, security: sec, region: r, via: i ? (via || 'gate') : null, viaLabel: via ? 'Thera K162 · KLE-221' : null, kills: n === 'Tama' ? 17 : n === 'Kedama' ? 4 : 0, npc: i * 3 })) } }) };
api.fin = { history: async () => ({ ok: true, data: { totals: Array.from({ length: 60 }, (_, i) => ({ date: new Date(now - (59 - i) * D).toISOString().slice(0, 10), wallet: 4.2e9 + i * 3.1e7 + Math.sin(i / 3) * 2e8, assets: 11.5e9 + i * 6e7, sp: 187e6 + i * 2e5 })).map(x => ({ ...x, total: x.wallet + x.assets })),
  pilots: [[2119000001, 'Richard Fitzwell', 4.8e9, 9.42e9, 128e6], [2119000002, 'Mike Hunt', 0.91e9, 3.1e9, 46e6], [2119000003, 'Hugh Jayness', 0.04e9, 0.6e9, 12.8e6]].map(([id, n, w, a, sp]) => ({ id, name: n, points: [{ date: '2026-10-01', wallet: w * 0.8, assets: a * 0.9, total: (w * 0.8 + a * 0.9), sp }, { date: '2026-11-07', wallet: w, assets: a, total: w + a, sp }] })) } }), snapshot: async () => ({ ok: true }), income: async () => { const daily = Array.from({ length: 30 }, (_, i) => ({ date: new Date(now - (29 - i) * D).toISOString().slice(0, 10), income: 90e6 + Math.round(60e6 * Math.abs(Math.sin(i / 2.3))), expense: 30e6 + Math.round(25e6 * Math.abs(Math.cos(i / 3))), ratting: 40e6 + Math.round(30e6 * Math.abs(Math.sin(i / 1.7))) }));
    const inc = daily.reduce((n, x) => n + x.income, 0), exp = daily.reduce((n, x) => n + x.expense, 0);
    return { ok: true, data: { days: 30, income: inc, expense: exp, net: inc - exp, entries: 1842, ratting: { ticks: 412, perTick: 5.2e6, perHour: 15.6e6 }, daily,
      categories: [['bounty_prizes', 1.71e9, 0], ['market_transaction', 1.2e9, 0.84e9], ['ess_escrow_transfer', 0.42e9, 0], ['contract_reward', 0.21e9, 0], ['market_provider_tax', 0, 0.12e9], ['brokers_fee', 0, 0.09e9], ['industry_job_tax', 0, 0.07e9], ['planetary_export_tax', 0, 0.03e9]].map(([category, income, expense]) => ({ category, income, expense, entries: 40 + Math.round(income / 1e8) })) } }; } };
api.intel = { config: async () => ({ ok: true, data: { enabled: true, channels: ['Forge Intel', 'SDRFT Intel'], channelsSeen: ['Corp', 'Forge Intel', 'SDRFT Intel', 'Alliance', 'Help chat'], jumps: 5, sound: true, notify: true, folder: '', root: 'C:\\Users\\Capsuleer\\Documents\\EVE\\logs' } }),
  reports: async () => ({ ok: true, data: { spikes: [{ system: 'Uedama', security: 0.5, zone: 'hs', shipKills: 14, podKills: 3, near: { jumps: 1, pilot: 'Hugh Jayness' } }, { system: 'Kedama', security: 0.33, zone: 'ls', shipKills: 7, podKills: 2, near: { jumps: 1, pilot: 'Richard Fitzwell' } }],
    local: [{ at: iso(now - 3 * 60e3), pilot: { id: 2119000202, name: 'Hugh Mungus', score: 71, level: 'High', tone: 'red', flags: [{ id: 'ganker', label: 'Highsec ganker', tone: 'red' }, { id: 'outlaw', label: 'Outlaw', tone: 'gold' }] }, level: 'Extreme', alert: true, system: 'Uedama', listener: 'Hugh Jayness' }],
    pilots: [{ pilot: 'Richard Fitzwell', system: 'Tama' }, { pilot: 'Mike Hunt', system: 'Amarr' }], reports: [
    { at: iso(now - 60e3), channel: 'SDRFT Intel', who: 'Sue Flay', text: 'Kedama  Ben Dover Loki +3 gate to Tama', systems: [{ name: 'Kedama', near: { jumps: 1, pilot: 'Richard Fitzwell' } }, { name: 'Tama', near: { jumps: 0, pilot: 'Richard Fitzwell' } }], alert: true, pilots: [{ id: 2119000201, name: 'Ben Dover', score: 82, level: 'Extreme', tone: 'red', flags: [{ id: 'hotdrop', label: 'Hotdropper', tone: 'red' }, { id: 'active', label: 'Active now', tone: 'red' }] }] },
    { at: iso(now - 4 * 60e3), channel: 'Forge Intel', who: 'Warren Peace', text: 'Sirppala clr', systems: [{ name: 'Sirppala', near: { jumps: 6, pilot: 'Richard Fitzwell' } }], clear: true },
    { at: iso(now - 7 * 60e3), channel: 'SDRFT Intel', who: 'Sal Monella', text: 'Nennamaila 12 reds sabre bubble on Aokannitoh gate', systems: [{ name: 'Nennamaila', near: { jumps: 3, pilot: 'Richard Fitzwell' } }], alert: true },
    { at: iso(now - 15 * 60e3), channel: 'Forge Intel', who: 'Barb Dwyer', text: 'status Perimeter?', systems: [{ name: 'Perimeter', near: { jumps: 8, pilot: 'Richard Fitzwell' } }], question: true }] } }),
  setConfig: async c => ({ ok: true, data: c }), pickFolder: async () => ({ ok: true }), onReport: () => {}, onPilots: () => {}, onStatus: () => {}, onCombat: () => {}, onLocal: () => {}, onSpikes: () => {}, checkSpikes: async () => ({ ok: true, data: [] }), local: async () => ({ ok: true, data: { total: 5, hostiles: 1, blues: 1, neutrals: 3, unknown: [], groups: [{ name: 'Umbral Reach', count: 2, standing: -10 }, { name: 'State War Academy', count: 3, standing: null }], pilots: [['Ben Dover', -10, 'Night Shift Logistics', 'Umbral Reach'], ['Hugh Mungus', null, 'Gank Co', null], ['Anita Bath', null, 'State War Academy', null], ['Eileen Dover', null, 'State War Academy', null], ['Pat McGroin', 5, 'Friendly Corp', null], ['Barry Cade', null, 'Gank Co', null], ['Neil Down', -5, 'Night Shift Logistics', 'Umbral Reach'], ['Dee Zaster', null, 'Rusty Bolt Industrial', null]].map(([name, standing, corporation, alliance], i) => ({ id: 2119000201 + i, name, standing, corporation, alliance, mine: false })) } }), dscan: async () => ({ ok: false }), zkill: async () => ({ ok: true, data: {} }), resetCombat: async () => ({ ok: true }) };
api.doctrine = { parseEft: async () => ({ ok: false }), evaluate: async d => ({ ok: true, data: { canFly: 9, fits: [{ id: 'f1', name: 'Sentry Ishtar', ship: 'Ishtar', shipTypeId: 12005, cost: 412e6, hullCost: 298e6, requirements: 41, pilots: Array(9).fill({ canFly: true }) }, { id: 'f2', name: 'Logi Scimitar', ship: 'Scimitar', shipTypeId: 11978, cost: 302e6, hullCost: 241e6, requirements: 33, pilots: Array(4).fill({ canFly: true }) }],
  pilots: mList.slice(0, 11).map((p, i) => ({ id: p.id, name: p.name, fit: i % 3 ? 'Sentry Ishtar' : 'Logi Scimitar', canFly: i < 9 ? i % 4 !== 3 : false, minutes: i % 4 === 3 ? 3 * 1440 : i > 8 ? 34 * 1440 : 0, missing: i % 4 === 3 || i > 8 ? [{ name: 'Heavy Assault Cruisers', level: 4 }, { name: 'Sentry Drone Interfacing', level: 4 }] : [], fromAudit: i > 2 })) } }) };
wsData.doctrines = [{ id: 'd1', name: 'Sentry Ishtars', description: 'Home defense doctrine: armor sentry Ishtars with Scimitar logi.', fits: [{ id: 'f1' }, { id: 'f2' }] }, { id: 'd2', name: 'Kitey Vagabonds', fits: [{ id: 'x' }] }];
wsData.invoices = []; wsData.alts = {};
api.onUpdate = () => {}; api.updateInfo = async () => ({ ok: true, data: null }); api.update = { prepare: async () => ({ ok: true, data: { phase: 'ready', pct: 100, version: '1.9.1' } }), install: async () => ({ ok: true }), status: async () => ({ ok: true, data: { phase: 'idle' } }), justUpdated: async () => ({ ok: true, data: null }), onProgress: () => {} }; api.checkUpdate = async () => ({ ok: true, data: null }); api.copy = async () => ({ ok: true });
api.corpx = { moonTax: async (d, from, to, rate) => { const miners = [['Mike Hunt', 'Hard Rock Excavations', 4.2e6, 1.84e9], ['Jack Mehoff', 'Hard Rock Excavations', 2.9e6, 1.21e9], ['Rusty Pipes', 'Deep Pockets Salvage', 1.7e6, 0.74e9], ['Lance Boyle', 'Deep Pockets Salvage', 0.9e6, 0.39e9]].map(([name, corp, quantity, value], i) => ({ id: 2119000300 + i, name, corp, quantity, value, ores: {}, tax: Math.round(value * (rate || 10) / 100) }));
    return { ok: true, data: { from, to, rate: rate || 10, miners, totalValue: miners.reduce((n, m) => n + m.value, 0), totalTax: miners.reduce((n, m) => n + m.tax, 0) } }; },
  sync: async () => ({ ok: true, data: {} }), onSynced: () => {}, buybackRules: async () => ({ ok: true, data: { percent: 90, categories: {} } }) };
api.loyalty = async () => ({ ok: true, data: [] });

api.nav.jump = async () => ({ ok: true, data: { jumps: 3, from: '1DQ1-A', to: 'Amamake', range: 7, ship: 'Carrier / Dreadnought / FAX', jdc: 5, totalLy: 18.4, finalFatigueMin: 95, waitMin: 22,
  legs: [['1DQ1-A','Y-2ANO',-0.4,'Delve',6.8,4,30],['Y-2ANO','Obe',0.0,'Placid',6.1,9,62],['Obe','Amamake',0.4,'Heimatar',5.5,0,95]].map(([f,t,sec,r,ly,re,fa]) => ({ from: f, to: t, security: sec, region: r, ly, reactivationMin: re, fatigueMin: fa })) } });
api.nav.range = async () => ({ ok: true, data: [{ name: 'Obe', security: 0.0, region: 'Placid', ly: 4.2 }] });
api.trade = {
  watchlist: async () => ({ ok: true, data: ['Tritanium', 'PLEX'] }),
  arbitrage: async () => ({ ok: true, data: { rows: [{ typeId: 34, name: 'Tritanium', buyAt: 4.1, sellRelist: 4.6, marginRelist: 0.08, profitRelist: 0.3, profitInstant: -0.1, perM3: 30 }] } }),
  myOrders: async () => ({ ok: true, data: [{ charId: 2119000001, charName: 'Richard Fitzwell', type_id: 2185, typeName: 'Hammerhead II', is_buy_order: false, price: 1450000, volume_remain: 8, volume_total: 20, locationName: 'Jita IV - Moon 4', check: { beaten: true, best: 1440000, by: 10000 } }] }),
  lp: async () => ({ ok: true, data: { rows: [
    { typeId: 1, name: 'Impel Corporation Emblem', quantity: 1, lp: 9000, isk: 0, required: [], reqCost: 0, value: 0, iskPerLp: 0, valueBuy: null },
    { typeId: 2, name: 'Navy Cap Booster 400', quantity: 10, lp: 1000, isk: 100000, required: [], reqCost: 0, value: 1400000, iskPerLp: 1300, valueBuy: 1300000, iskPerLpBuy: 1200, iskPerLpSell: 1400, volume: 900 },
    { typeId: 3, name: 'Old Thing', quantity: 1, lp: 500, isk: 0, required: [], reqCost: 0, value: 250000, iskPerLp: 500 } ] } }) };

const PROFILE = { id: 2119000201, name: 'Ben Dover', birthday: iso(now - 2300 * D), security: -3.4, title: null, bio: 'Recruiting for hunting ops. Convo for details.',
  corporation: { id: 98000101, name: 'Night Shift Logistics', ticker: 'NSLX', members: 41, warEligible: true, npc: false }, alliance: { id: 99000101, name: 'Umbral Reach', ticker: 'UMBR' },
  history: [{ name: 'Night Shift Logistics', start: iso(now - 400 * D) }, { name: 'Glass Harbour', start: iso(now - 900 * D) }, { name: 'State War Academy', start: iso(now - 2300 * D) }], corpChanges: 3,
  stats: { kills: 1843, losses: 212, solo: 96, iskDestroyed: 412e9, iskLost: 38e9, danger: 94, gang: 88, activity: Object.fromEntries([0,1,2,3,4,5,6].map(d => [d, Object.fromEntries(Array.from({ length: 24 }, (_, h) => [h, Math.round(20 * Math.exp(-((h - 19) ** 2) / 12) + 2)]))])) },
  zkError: null, standing: -10, watch: { tag: 'hostile', note: 'Falcon / Redeemer drops on Tama gate', added: iso(now - 20 * D) },
  score: 88, level: 'Extreme', tone: 'red', pvpScore: 88, gankScore: 4,
  zones: { hs: { score: 40, level: 'Moderate', tone: 'gold', share: 4 }, ls: { score: 88, level: 'Extreme', tone: 'red', share: 61 }, ns: { score: 77, level: 'Extreme', tone: 'red', share: 33 }, wh: { score: 40, level: 'Moderate', tone: 'gold', share: 2 }, pochven: { score: 40, level: 'Moderate', tone: 'gold', share: 0 } },
  flags: [{ id: 'active', label: 'Active now', tone: 'red', why: '' }, { id: 'hotdrop', label: 'Hotdropper', tone: 'red', why: '' }, { id: 'blops', label: 'Black Ops', tone: 'red', why: '' }, { id: 'cyno', label: 'Cyno pilot', tone: 'red', why: '' }, { id: 'red', label: 'Red to you', tone: 'red', why: '' }, { id: 'watch', label: 'On your watchlist', tone: 'red', why: '' }, { id: 'cloaky', label: 'Cloaky hunter', tone: 'gold', why: '' }, { id: 'criminalish', label: 'Negative sec', tone: '', why: '' }],
  reasons: [{ pts: 20, text: 'Got a kill in the last 48 hours' }, { pts: 18, text: '212 kills in the last 3 months' }, { pts: 16, text: 'zKillboard danger ratio 94%' }, { pts: 14, text: '6 recent kills with Black Ops or capitals jumping in' }, { pts: 15, text: 'You tagged them as hostile' }, { pts: 10, text: 'Red to you (-10)' }, { pts: 8, text: 'Lost 1 ship fitted with a cyno' }],
  topShips: [[22436, 'Redeemer', 'Black Ops', 41], [11957, 'Falcon', 'Force Recon Ship', 33], [22460, 'Sabre', 'Interdictor', 12], [29984, 'Tengu', 'Strategic Cruiser', 9]].map(([typeId, name, group, kills]) => ({ typeId, name, group, kills })),
  kills: [[0.2, 'Tama', 'ls', 22436, 'Redeemer', 648, 'Badger', 9, 41e6], [0.9, 'Kedama', 'ls', 11957, 'Falcon', 32880, 'Venture', 6, 12e6], [1.4, 'Tama', 'ls', 22436, 'Redeemer', 24698, 'Drake', 11, 98e6], [3, 'Hevrice', 'ls', 22460, 'Sabre', 587, 'Rifter', 1, 2e6]].map(([d, system, zone, ship, shipName, victimShip, victimShipName, attackers, value], i) => ({ id: 120000000 + i, time: iso(now - d * D), system, zone, ship, shipName, victimShip, victimShipName, attackers, solo: attackers === 1, value })),
  losses: [{ id: 119999000, time: iso(now - 40 * D), system: 'Aokannitoh', zone: 'ls', ship: 11957, shipName: 'Falcon', attackers: 14, cyno: true, value: 310e6 }],
  lastKillAt: iso(now - 0.2 * D), at: iso(now - 2 * 60e3), cached: false };
PROFILE.kills[0] = { ...PROFILE.kills[0], fitted: 28e6, dropped: 11e6, damage: 18420, victimId: 2119000299, victimName: 'Chris P Bacon',
  fleet: [{ typeId: 22436, name: 'Redeemer', n: 4 }, { typeId: 11957, name: 'Falcon', n: 2 }, { typeId: 22460, name: 'Sabre', n: 1 }, { typeId: 12005, name: 'Ishtar', n: 2 }],
  pilots: [['Ben Dover', 22436, 'Redeemer', 6210, true], ['Mike Oxlong', 22436, 'Redeemer', 5480], ['Ray Gunn', 12005, 'Ishtar', 3920], ['Anna Conda', 11957, 'Falcon', 0]].map(([name, ship, shipName, damage, finalBlow], i) => ({ id: i ? 2119000300 + i : 2119000201, name, ship, shipName, damage, finalBlow: !!finalBlow })) };
api.clip = { onLocal: () => {}, onDscan: () => {} };
api.phone = { get: async () => ({ ok: true, data: { enabled: true, ntfy: 'https://ntfy.sh/evetk-k3j9x2m1qz', webhook: '', onlyAway: true, categories: { skills: true, industry: true, planets: true, intel: true, structures: true, ops: true }, categoryLabels: { skills: 'Skill queue empty, paused or ending', industry: 'Industry jobs finished or slots idle', planets: 'PI extractors stopping', market: 'Orders, undercuts and contracts', intel: 'Intel threats, Local threats and kill spikes', structures: 'Corp structure attacks and fuel', ops: 'Ops and timers starting soon', wormhole: 'New wormhole connections mapped', corp: 'Wars and corp applications', app: 'App updates' } } }), save: async c => ({ ok: true, data: c }), test: async () => ({ ok: true, data: true }) };
api.ui = { pilots: async () => ({ ok: true, data: [{ id: 2119000001, name: 'Richard Fitzwell', online: true, canWaypoint: true, canOpenWindow: true }] }), waypoints: async (c, ids) => ({ ok: true, data: { sent: ids.length, pilot: 'Richard Fitzwell' } }), open: async () => ({ ok: true, data: { pilot: 'Richard Fitzwell' } }), mail: async () => ({ ok: true, data: { pilot: 'Richard Fitzwell' } }) };
const VET = { id: 2119000201, name: 'Ben Dover', risk: 72, label: 'High risk', tone: 'red', advice: 'Treat as a likely spy or awoxer. Ask for a full audit and voice interview, and keep roles and hangar access minimal.',
  reasons: [{ pts: 25, text: '1 awox kill (killing their own corp members)', tone: 'red' }, { pts: 20, text: '6 player corps in the last year', tone: 'red' }, { pts: 24, text: 'Previously in corps you\u2019re red to: Night Shift Logistics, Glass Harbour', tone: 'red' }, { pts: 5, text: '2 past corps left within a month', tone: 'gold' }, { pts: -5, text: 'Active PvP record (1843 kills)', tone: 'green' }],
  stays: [{ name: 'Night Shift Logistics', days: 12, start: iso(now - 12 * D) }, { name: 'Glass Harbour', days: 19, start: iso(now - 31 * D) }, { name: 'Umbral Vanguard', days: 140, start: iso(now - 171 * D) }, { name: 'State War Academy', days: 30, start: iso(now - 2300 * D), npc: true }], at: iso(now) };
api.pilot = { vet: async () => ({ ok: true, data: VET }), profile: async () => ({ ok: true, data: PROFILE }), quickMany: async list => ({ ok: true, data: Object.fromEntries(list.map((p, i) => [p.id, { id: p.id, name: p.name, score: [88, 61, 33, 12, 0][i % 5], level: ['Extreme', 'High', 'Moderate', 'Low', 'Minimal'][i % 5], tone: ['red', 'red', 'gold', '', 'green'][i % 5], flags: i % 5 === 0 ? [{ id: 'hotdrop', label: 'Hotdropper', tone: 'red' }] : i % 5 === 1 ? [{ id: 'ganker', label: 'Highsec ganker', tone: 'red' }] : [] }])) }),
  watch: async () => ({ ok: true, data: {} }), watchlist: async () => ({ ok: true, data: { 2119000201: { name: 'Ben Dover', tag: 'hostile', note: 'Falcon / Redeemer drops on Tama gate' }, 2119000202: { name: 'Hugh Mungus', tag: 'ganker', note: 'Uedama Catalyst fleet' } } }),
  recent: async () => ({ ok: true, data: [{ id: 2119000201, name: 'Ben Dover', score: 88, level: 'Extreme', tone: 'red', at: iso(now - 2 * 60e3) }, { id: 2119000203, name: 'Anita Bath', score: 6, level: 'Minimal', tone: 'green', at: iso(now - 3 * 3600e3) }] }),
  onProgress: () => {} };

api.nav.routeCheck = async () => ({ ok: true, data: { hours: 1, checked: 3, verdict: 'danger', at: iso(now), reports: [
  { systemId: 30000108, system: 'Kedama', security: 0.33, index: 8, groups: [{ name: 'Umbral Reach', kills: 4 }], ships: [{ typeId: 17738, name: 'Machariel', kills: 4 }, { typeId: 11957, name: 'Falcon', kills: 3 }],
    hazards: [{ type: 'camp', severity: 'danger', title: 'Gate camp at the Tama gate', onRoute: true, detail: '4 kills there, the latest 6 min ago. Smartbombs likely: pods and shuttles are dying too.' }],
    pilots: [{ id: 2119000201, name: 'Ben Dover', level: 'Extreme', tone: 'red', flags: [{ label: 'Hotdropper' }] }],
    kills: [{ id: 1, time: iso(now - 6 * 60e3), victimShip: 670, victimShipName: 'Capsule', where: 'Tama gate', attackers: 3, value: 2e6 }, { id: 2, time: iso(now - 11 * 60e3), victimShip: 648, victimShipName: 'Badger', where: 'Tama gate', attackers: 5, value: 61e6 }] },
  { systemId: 30000103, system: 'Sirppala', security: 0.92, index: 3, groups: [{ name: 'Safety.', kills: 1 }], ships: [{ typeId: 16240, name: 'Catalyst', kills: 1 }],
    hazards: [{ type: 'gank', severity: 'warn', title: 'Suicide ganking', detail: '1 gank kill and 6 ganker ships killed by CONCORD, latest 52 min ago. Targets: Freighter. Don’t autopilot through here.' }], kills: [] },
  { systemId: 30000109, system: 'Tama', security: 0.3, index: 9, groups: [], hazards: [{ type: 'activity', severity: 'info', title: 'Recent PvP', detail: '1 player kill, the latest 38 min ago.' }], kills: [] }] } });

api.couriers = { regions: async () => ({ ok: true, data: [{ id: 10000002, name: 'The Forge' }, { id: 10000043, name: 'Domain' }, { id: 10000032, name: 'Sinq Laison' }, { id: 10000033, name: 'The Citadel' }] }),
  find: async () => ({ ok: true, data: { from: 'Jita', regions: ['The Forge', 'The Citadel'], total: 412, shown: 4, unknownLoc: 23, rows: [
    { id: 201, issuerId: 2119000203, issuer: 'Anita Bath', reward: 48e6, collateral: 900e6, volume: 58000, from: { system: 'Jita', security: 0.95, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' }, to: { system: 'Amarr', security: 1.0, name: 'Amarr VIII (Oris) - Emperor Family Academy' }, pickupJumps: 0, jumps: 45, iskPerJump: 1066666, lowsecJumps: 0, leavesHs: false, warn: [], path: [1, 2] },
    { id: 202, issuerId: 2119000204, issuer: 'Eileen Dover', reward: 22e6, collateral: 150e6, volume: 12000, from: { system: 'Perimeter', security: 0.95, name: 'Perimeter - Tranquility Trading Tower' }, to: { system: 'Dodixie', security: 0.87, name: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant' }, pickupJumps: 1, jumps: 15, iskPerJump: 1375000, lowsecJumps: 0, leavesHs: false, warn: [], path: [1, 2] },
    { id: 203, issuerId: 2119000202, issuer: 'Hugh Mungus', reward: 90e6, collateral: 30e9, volume: 300000, from: { system: 'Jita', security: 0.95, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' }, to: { system: 'Tama', security: 0.3, name: 'Tama VII - Moon 9 - Republic Security Services Testing Facilities' }, pickupJumps: 0, jumps: 9, iskPerJump: 10000000, lowsecJumps: 1, leavesHs: true, warn: ['Route leaves highsec', 'Very high collateral for the reward'], path: [1, 2] },
    { id: 204, issuerId: 2119000205, issuer: 'Pat McGroin', reward: 6e6, collateral: 20e6, volume: 3000, from: { system: 'Urlen', security: 0.96, name: 'Urlen I - Caldari Business Tribunal' }, to: { system: 'Sobaseki', security: 0.84, name: 'Sobaseki VII - Moon 3 - Ishukone Corporation Factory' }, pickupJumps: 2, jumps: 4, iskPerJump: 1000000, lowsecJumps: 0, leavesHs: false, warn: [], path: [1, 2] }] } }) };

api.appraise = async () => ({ ok: true, data: { hub: 'Jita', unknown: [], totals: { sell: 412_500_000, buy: 389_200_000, split: 400_850_000, volume: 17_340, items: 10011 },
  rows: [{ typeId: 12005, name: 'Ishtar', qty: 1, sell: 298_000_000, buy: 284_500_000, volume: 15000 }, { typeId: 2185, name: 'Hammerhead II', qty: 10, sell: 14_900_000, buy: 13_100_000, volume: 100 },
    { typeId: 34, name: 'Tritanium', qty: 10000, sell: 41_000, buy: 38_500, volume: 100 }, { typeId: 2488, name: 'Warrior II', qty: 10, sell: 6_200_000, buy: 5_400_000, volume: 50, noOrders: false }] } });

api.nav.universe = async () => ({ ok: true, data: {
  campaigns: [{ system: 'Y-2ANO', region: 'Delve', type: 'Infrastructure Hub', defender: 'Loose Cannons Coalition', start: iso(now + 3 * H), defenderScore: 0.6, attackersScore: 0.4 }, { system: '1DQ1-A', region: 'Delve', type: 'Sovereignty Hub', defender: 'Umbral Reach', start: iso(now - 20 * 60e3), defenderScore: 0.35, attackersScore: 0.65 }, { system: 'Obe', region: 'Placid', type: 'Infrastructure Hub', defender: 'Shady Harbour Capital', start: iso(now + 26 * H), defenderScore: 0.5, attackersScore: 0.5 }],
  incursions: [{ region: 'The Citadel', staging: 'Nalvula', state: 'established', influence: 0.62, boss: true, systems: 7, nav: 'Nalvula' }, { region: 'Domain', staging: 'Sarum Prime', state: 'mobilizing', influence: 0.14, boss: false, systems: 9, nav: 'Sarum Prime' }],
  thera: [{ hub: 'Thera', system: 'Nennamaila', region: 'The Citadel', sig: 'KLE-221', hubSig: 'QRT-110', size: 'large', hours: 13 }, { hub: 'Thera', system: 'Hek', region: 'Metropolis', sig: 'BXA-902', hubSig: 'MNO-554', size: 'xlarge', hours: 4 }, { hub: 'Turnur', system: 'Amamake', region: 'Heimatar', sig: 'ZZQ-310', hubSig: 'PLA-008', size: 'medium', hours: 9 }],
  fw: [{ system: 'Tama', region: 'The Citadel', owner: 'Caldari State', occupier: 'Caldari State', contested: 'contested', pct: 0.63 }, { system: 'Kedama', region: 'The Citadel', owner: 'Gallente Federation', occupier: 'Gallente Federation', contested: 'vulnerable', pct: 1.0 }, { system: 'Huola', region: 'The Bleak Lands', owner: 'Amarr Empire', occupier: 'Minmatar Republic', contested: 'contested', pct: 0.41 }]
} });
api.trade.lp = api.trade.lp;

// ---- 1.8 demo data: live map, hunting, wormhole residents, PvE, overlay, bridges ----
const MAPN = ['1DQ1-A', '8QT-H4', 'T5ZI-S', 'PR-8CN', 'K-6K16', 'Y-2ANO', 'NOL-M9', 'GY6A-L', 'QY6-RK', 'J5A-IX', '5BTK-M', 'D-W7F0', 'O-IVNF', 'S-6HHN', 'QX-LIJ', 'RNM-Y6', 'MJXW-P', 'HM-XR2', 'F-TE1T', '3-DMQT', 'C3N-3S', 'YZ9-F6', '4-07MU', 'UEXO-Z', 'B-DBYQ', 'XZH-4X', 'KBAK-I', 'H-PA29', 'IP6V-X', '0-HDC8'];
const MAPS = MAPN.map((name, i) => { const gx = i % 6, gy = Math.floor(i / 6); const w = ((i * 37) % 11) / 10; return { id: 30004759 + i, name, security: -((i * 13) % 10) / 10 - 0.05, x: gx * 9e16 + w * 3e16, z: -gy * 9e16 + ((i * 7) % 5) * 1.5e16, constellation: ['38G6-L', 'PUWL-4', 'FY6-NK', 'O-EIMK', 'YX-LYE'][gy], ship: [0, 0, 3, 0, 1, 7, 0, 0, 12, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 0, 1, 0, 0, 0, 0, 6, 0, 0, 0, 0][i], pod: [0, 0, 1, 0, 0, 3, 0, 0, 5, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0][i], npc: [0, 40, 0, 180, 95, 0, 210, 120, 0, 60, 0, 30, 140, 0, 75, 0, 160, 0, 25, 90, 0, 130, 0, 55, 0, 0, 200, 15, 0, 110][i], jumps: [420, 60, 310, 22, 15, 180, 8, 12, 260, 30, 5, 70, 9, 2, 14, 120, 6, 1, 18, 11, 40, 7, 3, 9, 1, 150, 4, 10, 2, 6][i], sov: i % 7 === 3 ? 99000666 : 99000001, gates: i % 9 === 4 ? 1 : 2 + (i % 3) }; });
const MAPE = []; MAPS.forEach((s, i) => { if (i % 6 < 5) MAPE.push([s.id, MAPS[i + 1].id]); if (i + 6 < MAPS.length && (i % 2 === 0 || i % 5 === 0)) MAPE.push([s.id, MAPS[i + 6].id]); });
MAPE.push([MAPS[29].id, 30003000, 'out'], [MAPS[0].id, 30003001, 'out']);
api.map = { region: async () => ({ ok: true, data: { regionId: 10000060, region: 'Delve', systems: MAPS, external: [{ id: 30003000, name: 'EX6-AO', region: 'Querious', regionId: 10000050, security: -0.3, x: 6 * 9e16, z: -5 * 9e16 }, { id: 30003001, name: 'ZXB-VC', region: 'Fountain', regionId: 10000058, security: -0.4, x: -1.2e17, z: 2e16 }], edges: MAPE, bridges: [[MAPS[0].id, MAPS[22].id], [MAPS[5].id, MAPS[26].id]], wormholes: [{ inside: MAPS[13].id, otherName: 'J123450', type: 'C247' }], sovNames: { 99000001: 'Loose Cannons Coalition', 99000666: 'Umbral Reach' }, updated: iso(now - 4 * 60e3) } }) };
api.couriers.regions = async () => ({ ok: true, data: [{ id: 10000060, name: 'Delve' }, { id: 10000002, name: 'The Forge' }, { id: 10000050, name: 'Querious' }] });
api.hunt = { find: async o => ({ ok: true, data: { from: o.from || 'T5ZI-S', mode: o.mode, jumps: o.jumps || 6, checked: 48, updated: iso(now - 4 * 60e3), rows: (o.mode === 'rat'
    ? [['UEXO-Z', -0.3, 3, 0, 0, 0, 1, 1, 100, ['no ships or pods killed in the last hour', '1 jump through it in the last hour', 'dead end: hostiles have to come in through one gate']], ['B-DBYQ', -0.5, 4, 55, 0, 0, 1, 2, 74, ['no ships or pods killed in the last hour', '1 jump through it in the last hour']], ['S-6HHN', -0.4, 2, 0, 0, 0, 2, 2, 61, ['no ships or pods killed in the last hour', '2 jumps through it in the last hour']], ['IP6V-X', -0.8, 5, 0, 0, 0, 2, 3, 48, ['no ships or pods killed in the last hour', '2 jumps through it in the last hour']]]
    : [['NOL-M9', -0.65, 3, 210, 0, 0, 8, 1, 100, ['210 NPCs killed in the last hour', 'no PvP kills in the last hour', 'dead end: one way in, one way out']], ['MJXW-P', -0.45, 4, 160, 0, 0, 6, 2, 71, ['160 NPCs killed in the last hour', 'no PvP kills in the last hour']], ['KBAK-I', -0.75, 5, 200, 0, 0, 4, 2, 66, ['200 NPCs killed in the last hour', 'no PvP kills in the last hour']], ['PR-8CN', -0.5, 1, 180, 0, 0, 22, 3, 58, ['180 NPCs killed in the last hour', 'no PvP kills in the last hour']], ['QY6-RK', -0.85, 2, 140, 12, 5, 260, 3, 9, ['140 NPCs killed in the last hour', '12 ships and 5 pods died there too: someone may already be hunting']]]
  ).map(([name, security, jumps, npc, ship, pod, traffic, gates, pct, why], i) => ({ id: 30004800 + i, name, security, region: 'Delve', regionId: 10000060, zone: 'ns', jumps, npc, ship, pod, traffic, gates, pct, why, sovName: i % 3 ? 'Loose Cannons Coalition' : 'Umbral Reach' })) } }), deep: async id => ({ ok: true, data: { systemId: id, hours: 3, kills: id % 2 ? 0 : 2, value: 3.1e8 } }) };
api.whRes = async () => ({ ok: true, data: { id: 31000101, name: 'J123450', isWh: true, whClass: 4, region: 'D-R00018', verdict: 'Looks occupied by Hole Control.', info: { cls: 'C4', effect: 'Pulsar', effectSummary: 'More shield HP and faster capacitor recharge, but weaker armour resists, bigger signatures and stronger neuts.', statics: [{ code: 'X877', leadsTo: 'C4', lifeHours: 16, totalMass: 2e9, jumpMass: 375e6 }, { code: 'U574', leadsTo: 'C6', lifeHours: 24, totalMass: 3e9, jumpMass: 375e6 }], staticsKnown: true }, quietDays: 0, lastKill: iso(now - 5 * H), mailsChecked: 50, kills30: 41,
  groups: [{ id: 99000801, alliance: true, name: 'Hole Control', role: 'Likely resident', daysActive: 14, attacks: 31, losses: 6, pilots: 12, last: iso(now - 5 * H), structures: [], tz: { tz: 'EU (17–23 ET)' } }, { id: 98000802, alliance: false, name: 'Rusty Bolt Industrial', role: 'Dies here often', daysActive: 5, attacks: 0, losses: 7, pilots: 4, last: iso(now - 2 * D), structures: [], tz: { tz: 'EU (17–23 ET)' } },
    { id: 98000803, alliance: false, name: 'Far Horizon Exploration', role: 'Possibly evicted', daysActive: 2, attacks: 0, losses: 3, pilots: 3, last: iso(now - 22 * D), structures: [{ type: 'Astrahus', time: iso(now - 22 * D) }], tz: { tz: 'US (00–06 ET)' } }, { id: 99000804, alliance: true, name: 'Shady Harbour Capital', role: 'Eviction or roam', daysActive: 2, attacks: 9, losses: 0, pilots: 21, last: iso(now - 22 * D), structures: [], tz: { tz: 'US (00–06 ET)' } }],
  allTime: [{ id: 99000801, name: 'Hole Control', kills: 812 }, { id: 99000804, name: 'Shady Harbour Capital', kills: 140 }], heat: Array.from({ length: 24 }, (_, h) => Math.round(30 * Math.exp(-((h - 20) ** 2) / 10) + 3)), tz: [{ tz: 'EU (17–23 ET)', pct: 71 }, { tz: 'US (00–06 ET)', pct: 18 }, { tz: 'AU / Asia (07–14 ET)', pct: 11 }],
  structureLosses: [{ id: 1, type: 'Astrahus', owner: 'Far Horizon Exploration', time: iso(now - 22 * D) }, { id: 2, type: 'Athanor', owner: 'Far Horizon Exploration', time: iso(now - 22 * D) }], statsTotal: { kills: 1204, isk: 3.8e11 } } });
const FIL = ['Tranquil', 'Calm', 'Agitated', 'Fierce', 'Raging', 'Chaotic', 'Cataclysmic'].flatMap(t => ['Exotic', 'Firestorm', 'Gamma', 'Dark', 'Electrical'].map(w => `${t} ${w} Filament`));
api.pve = { onAbyss: () => {},
  ratting: async () => ({ ok: true, data: { days: 14, hours: 31.5, isk: 2.39e9, iskPerHour: 75.9e6, systems: [{ system: 'NOL-M9', minutes: 540, isk: 7.6e8, iskPerHour: 84.4e6 }, { system: 'KBAK-I', minutes: 780, isk: 9.9e8, iskPerHour: 76.2e6 }, { system: 'PR-8CN', minutes: 570, isk: 6.4e8, iskPerHour: 67.4e6 }],
    sessions: [[0.3, 'Wayne Kerr', 'NOL-M9', 140, 1.96e8, 0.21e8], [1.2, 'Wayne Kerr', 'KBAK-I', 200, 2.54e8, 0], [1.9, 'Richard Fitzwell', 'PR-8CN', 95, 1.05e8, 0.12e8], [3.1, 'Wayne Kerr', 'NOL-M9', 180, 2.42e8, 0.33e8], [4.2, 'Richard Fitzwell', 'KBAK-I', 120, 1.48e8, 0]].map(([d, charName, system, minutes, b, ess]) => ({ start: iso(now - d * D), charName, system, minutes, bounties: b, ess, isk: b + ess, iskPerHour: Math.round((b + ess) / minutes * 60) })) } }),
  abyss: async () => ({ ok: true, data: { cfg: { enabled: true, filament: 'Fierce Exotic Filament', overhead: 3, price: 'buy' }, filaments: FIL, open: [{ charName: 'Jack Mehoff', start: iso(now - 9 * 60e3) }],
    totals: { runs: 23, valued: 21, profit: 1.42e9, iskPerHour: 1.79e8, avgMinutes: 16, deaths: 1 },
    byFilament: [{ filament: 'Fierce Exotic Filament', runs: 14, avg: 7.4e7, iskPerHour: 2.31e8 }, { filament: 'Agitated Firestorm Filament', runs: 7, avg: 3.4e7, iskPerHour: 1.12e8 }],
    runs: [[0.05, 'Jack Mehoff', 'Fierce Exotic Filament', 15, 9.8e7, 1.9e7], [0.07, 'Jack Mehoff', 'Fierce Exotic Filament', 17, null, 1.9e7], [0.2, 'Jack Mehoff', 'Fierce Exotic Filament', 14, 6.1e7, 1.9e7], [0.9, 'Jack Mehoff', 'Agitated Firestorm Filament', 18, 4.2e7, 0.6e7], [1.1, 'Jack Mehoff', 'Fierce Exotic Filament', 19, 0, 1.9e7, true]]
      .map(([d, charName, filament, minutes, loot, fc, died], i) => ({ id: 'r' + i, start: iso(now - d * D), charName, filament, minutes, lootValue: loot, filamentCost: fc, died: !!died, profit: loot === null ? null : loot - fc, iskPerHour: loot === null ? null : Math.round((loot - fc) / (minutes + 3) * 60) })) } }),
  abyssCfg: async p => ({ ok: true, data: p }), abyssLoot: async () => ({ ok: true, data: { lootValue: 8.4e7 } }), abyssUpdate: async () => ({ ok: true, data: {} }), abyssAdd: async () => ({ ok: true, data: {} }), abyssRemove: async () => ({ ok: true, data: true }) };
{ const r0 = api.pve.ratting, a0 = api.pve.abyss;
  api.pve.ratting = async o => { const r = await r0(o); r.data.sessions.forEach((s, k) => { const n = Math.max(3, Math.round(s.minutes / 20)); s.tickList = Array.from({ length: n }, (_, i) => ({ time: new Date(Date.parse(s.start) + (i + 1) * 20 * 60e3).toISOString(), amount: Math.round(s.bounties / n * (0.7 + ((i * 7 + k) % 5) / 8)), system: s.system })); }); return r; };
  api.pve.abyss = async () => { const r = await a0(); r.data.runs[0].lootItems = [['Mutated Gyrostabilizer', 1, 4.1e7, 52230], ['Triglavian Survey Database', 14, 2.8e7, 48121], ['Exotic Particle Generator Unit', 3, 1.3e7, 48113], ['Rogue Drone Infestation Data', 22, 9e6, 52245], ['Zero-Point Condensate', 120, 7e6, 48112]].map(([name, qty, value, typeId]) => ({ name, qty, value, typeId })); return r; }; }
{ const H = 3600e3; const mk = (id, typeId, name, side, base, vol, below, above, note, fired, lastAlertH, trend) => ({ id, typeId, name, hub: 'Jita', side, below, above, note, added: now - 9 * D, fired: fired || { below: false, above: false }, lastAlert: lastAlertH ? now - lastAlertH * H : null, lastAt: now - 6 * 60e3,
    samples: Array.from({ length: 96 }, (_, i) => [now - (95 - i) * 15 * 60e3, (base < 100 ? (x => Math.round(x * 100) / 100) : Math.round)(base * (1 + trend * (i - 95) / 95 + vol * Math.sin(i * 0.37 + typeId % 7) + vol * 0.6 * Math.sin(i * 1.3)))]) });
  const PW = [mk('a', 44992, 'PLEX', 'sell', 4.18e6, 0.012, 4.2e6, 4.9e6, 'Buy for Omega', { below: true, above: false }, 2, -0.06), mk('b', 40520, 'Large Skill Injector', 'sell', 862e6, 0.01, 820e6, 950e6, '', null, null, 0.02),
    mk('c', 40519, 'Skill Extractor', 'buy', 402e6, 0.015, null, 420e6, 'Sell extractors when high', null, null, 0.03), mk('d', 12005, 'Ishtar', 'sell', 268e6, 0.008, 250e6, null, '', null, 30, -0.01),
    mk('e', 34, 'Tritanium', 'buy', 4.1, 0.02, 3.6, 5, 'Mining fleet sell point', null, null, 0.05), mk('f', 17738, 'Machariel', 'sell', 412e6, 0.01, null, 500e6, '', null, null, 0.01)];
  PW.forEach(r => { r.last = r.samples[r.samples.length - 1][1]; });
  api.priceWatch = { list: async () => ({ ok: true, data: PW }), add: async p => ({ ok: true, data: { ...p, name: p.name || 'Item' } }), update: async () => ({ ok: true, data: {} }), remove: async () => ({ ok: true, data: true }), check: async () => ({ ok: true, data: PW }), onUpdate: () => {} }; }
api.overlay = { toggle: async () => ({ ok: true, data: true }), cfg: async () => ({ ok: true, data: { locked: false, opacity: 0.92, open: false } }), lock: async v => ({ ok: true, data: { locked: v } }), opacity: async () => ({ ok: true }), setRoute: async () => ({ ok: true }),
  getRoute: async () => ({ ok: true, data: { from: '1DQ1-A', to: 'Y-2ANO', path: [['1DQ1-A', -0.38], ['8QT-H4', -0.15, null, 'bridge'], ['K-6K16', -0.35], ['Y-2ANO', -0.55, { severity: 'danger', title: 'camp' }]].map(([name, security, hazard, via], i) => ({ id: 30004759 + [0, 1, 4, 5][i], name, security, hazard: hazard || null, via: via || (i ? 'gate' : null) })) } }),
  stats: async ids => ({ ok: true, data: Object.fromEntries(ids.map(id => { const m = MAPS.find(x => x.id === id) || {}; return [id, { ship: m.ship || 0, pod: m.pod || 0, npc: m.npc || 0, jumps: m.jumps || 0 }]; })) }), onRoute: () => {}, onState: () => {}, theme: async () => ({ ok: true }), getTheme: async () => ({ ok: true, data: null }), onTheme: () => {} };
api.bridges = { list: async () => ({ ok: true, data: [{ a: 1, b: 2, aName: '1DQ1-A', bName: '4-07MU' }, { a: 3, b: 4, aName: 'Y-2ANO', bName: 'KBAK-I' }] }), parse: async t => ({ ok: true, data: { bridges: [], skipped: [] } }), save: async l => ({ ok: true, data: l }) };
api.intel.onSpike = () => {};

const SHC = { naked: ['Flew it naked', 'No modules fitted at all', 40], halfFit: ['Half-fitted', 'More than half the slots empty', 22], noTank: ['No tank', 'A combat ship with no tank modules', 18], mixedTank: ['Shield and armor? Pick one', 'Shield and armor tank on the same ship', 15], rainbow: ['Rainbow weapons', 'More than one weapon system fitted', 12], bling: ['All the bling, none of the skill', 'Faction, deadspace or officer modules, killed solo', 25], autopilot: ['Autopilot special', 'Hauler with a fortune in the cargo hold, ganked', 30], rats: ['Lost to the rats', 'An expensive ship killed by NPCs', 28], selfDestruct: ['Self-destructed', 'The pilot blew up their own ship', 20], awox: ['Awoxed', 'Killed by their own corp mates', 18], brain: ['Expensive brain', 'Podded with a fortune in implants', 22], goliath: ['David and Goliath', 'A big ship solo’d by a frigate or destroyer', 30], oof: ['Big oof', 'Lost more than 10 billion ISK in one go', 20] };
const shk = (id, victim, corp, ship, typeId, value, system, sec, tags, extra = {}) => ({ id, victim, victimId: 2119000400 + id, corp, alliance: null, ship, shipTypeId: typeId, value, cargoValue: extra.cargo || 0, system, security: sec, time: iso(now - (id * 37 % 23) * H), attackers: extra.att || 3, npc: !!extra.npc, finalShip: extra.final || null, fitted: extra.fitted ?? 8, slots: extra.slots || 16, tags: tags.map(t => ({ id: t, label: SHC[t][0], why: SHC[t][1], pts: SHC[t][2] })), score: extra.score });
const SHAME = [shk(1, 'Hugh Mungus', 'Gank Co', 'Charon', 20185, 8.9e9, 'Uedama', 0.5, ['naked', 'autopilot'], { cargo: 7.3e9, att: 22, fitted: 0, slots: 3, score: 214 }),
  shk(2, 'Ella Vator', 'Late Night Freight Co.', 'Megathron', 641, 2.4e8, 'Tama', 0.3, ['naked', 'goliath'], { att: 1, final: 'Rifter', fitted: 0, slots: 19, score: 154 }),
  shk(3, 'Russell Sprouts', 'Rusty Bolt Industrial', 'Machariel', 17738, 3.6e9, 'Kedama', 0.3, ['bling', 'goliath'], { att: 1, final: 'Hecate', fitted: 17, slots: 18, score: 131 }),
  shk(4, 'Anita Bath', 'Rusty Bolt Industrial', 'Rattlesnake', 17918, 1.9e9, 'Ostingele', 0.6, ['rats', 'mixedTank'], { npc: true, fitted: 16, slots: 17, score: 98 }),
  shk(5, 'Dixie Normous', 'Hard Rock Excavations', 'Capsule', 670, 4.2e9, 'Jita', 0.9, ['brain'], { att: 9, fitted: 0, slots: 0, score: 82 }),
  shk(6, 'Stan Dupp', 'Hard Rock Excavations', 'Hulk', 22544, 3.1e8, 'Uedama', 0.5, ['noTank', 'halfFit'], { att: 4, fitted: 5, slots: 13, score: 76 }),
  shk(7, 'Ivana Tinkle', 'Far Horizon Exploration', 'Thorax', 627, 3.5e7, 'Amamake', 0.4, ['mixedTank', 'rainbow'], { att: 2, fitted: 13, slots: 13, score: 42 }),
  shk(8, 'Harry Pitts', 'Backwater Navy', 'Raven', 638, 2.8e8, 'Hek', 0.5, ['selfDestruct'], { att: 1, fitted: 18, slots: 18, score: 39 }),
  shk(9, 'Oliver Klozoff', 'Shady Harbour Capital', 'Nyx', 23913, 2.4e10, 'Y-2ANO', -0.55, ['oof', 'awox'], { att: 41, fitted: 14, slots: 15, score: 71 })];
if (SHAME[0]) { SHAME[0].tags = SHAME[0].tags.map(t => ({ ...t, evidence: { mixedTank: 'Shield: Large Shield Extender II · Armour: 1600mm Steel Plates II', rainbow: 'Weapon types: Hybrid Weapon, Projectile Weapon', noTank: 'No shield, armour or hull tank modules or rigs fitted', halfFit: '3 of 15 high, mid and low slots fitted', naked: '0 of 3 high, mid and low slots fitted', autopilot: '7.30b ISK in cargo, caught by 22 pilots in highsec' }[t.id] || null }));
  SHAME[0].fit = { cargo: [{ id: 40520, name: 'Large Skill Injector', qty: 600 }, { id: 44992, name: 'PLEX', qty: 2500, dropped: true }, { id: 34, name: 'Tritanium', qty: 2000000 }] }; }
api.shame = { onProgress: () => {}, wall: async o => ({ ok: true, data: { period: o.period || 'day', scope: o.scope || 'all', zone: 'all', at: iso(now - 6 * 60e3),
  shame: SHAME.slice().sort((a, b) => b.score - a.score), oofs: SHAME.slice().sort((a, b) => b.value - a.value),
  offenders: [{ id: 2119000406, name: 'Stan Dupp', losses: 4, isk: 1.2e9, score: 211, tags: [['No tank', 3], ['Half-fitted', 2]] }, { id: 2119000401, name: 'Hugh Mungus', losses: 3, isk: 1.1e10, score: 190, tags: [['Autopilot special', 2], ['Flew it naked', 1]] }, { id: 2119000402, name: 'Ella Vator', losses: 2, isk: 4.1e8, score: 160, tags: [['David and Goliath', 2]] }],
  feeders: [{ id: 1, name: 'Shady Harbour Capital', losses: 12, isk: 3.1e10 }, { id: 2, name: 'Gank Co', losses: 31, isk: 1.4e10 }, { id: 3, name: 'Hard Rock Excavations', losses: 9, isk: 5.2e9 }],
  categories: Object.entries(SHC).map(([id, [label, why]]) => ({ id, label, why, count: SHAME.filter(k => k.tags.some(t => t.id === id)).length })).filter(c => c.count) } }) };

api.diag = { report: async () => ({ ok: true, data: 'EVE Toolkit 1.9.0\nSystem: Windows 11 Pro (10.0.26100), x64, 32 GB RAM\nElectron 38.8.6 · Chromium 140\nClient ID set: yes · Callback port 51515\nGame data: build 3419624\nPilots: 5 (0 need re-auth) · scopes per pilot: 41, 41, 41, 41, 41\nSettings: notifications=true minimizeToTray=true intelWatch=true clipboard=true spikeWatch=false phone=true speech=false uiScopes=false abyss=true theme=capsuleer zoom=1\nUptime: 42 min\n\nRecent log:\n2026-11-08T00:12:03Z INFO  [app] start 1.9.0 on win32 10.0.26100\n2026-11-08T00:31:44Z WARN  [esi] 502 GET /characters/2119000002/assets/: Bad gateway\n2026-11-08T00:40:12Z WARN  [zkill] 429 rate limited /stats/characterID/2119000201/' }), copy: async () => ({ ok: true, data: true }), openFolder: async () => ({ ok: true }), log: async () => ({ ok: true }) };
(() => {
  const nextReset = (() => { const d = new Date(now); const r = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 11); return r > now ? r : r + D; })();
  const pilots = [[2119000001, 'Richard Fitzwell', true, 7], [2119000002, 'Mike Hunt', true, 6], [2119000003, 'Hugh Jayness', false, 3], [2119000004, 'Wayne Kerr', true, 8], [2119000005, 'Jack Mehoff', false, 1]];
  const daysLeft = 23;
  const st = () => ({ ok: true, data: {
    cfg: { enabled: true, resetAlert: true, reminder: true, reminderHours: 3, monthly: true, tqUp: true, longDowntime: true, news: true, newsKinds: { login: true, sp: true, free: true, sale: false, event: true } },
    day: '2026-11-08', nextReset, monthSteps: 12, daysLeft,
    pilots: pilots.map(([id, name, doneToday, steps], i) => ({ id, name, track: i !== 4, doneToday, ticked: [['jumps3', 'npc25', 'salvage5'], ['jumps3', 'mine2000'], ['jumps3'], [], []][i] || [], steps, stepsLeft: 12 - steps, daysLeft, atRisk: i === 2, impossible: false })),
    goals: [['jumps3', 'Complete 3 jumps', 'Any three stargate jumps, in any ship. On every day.'], ['npc25', 'Destroy 25 non-capsuleers', 'Rat in a belt or a combat anomaly. Small NPCs and drones count.'], ['mine2000', 'Mine 2,000 units of ore', 'A cycle or two of a Venture in any belt.'], ['salvage5', 'Salvage 5 wrecks', 'Fit a salvager and clear a few wrecks after ratting or a mission.'], ['scan5', 'Scan 5 signatures', 'Probe five signatures down to 100%. Any kind counts.']].map(([id, name, tip]) => ({ id, name, tip })),
    catalogue: [], goalsForBonus: 2,
    newsAt: now - 12 * 60000, tq: { online: true, players: 24318, since: now - 3 * H },
    news: [
      { id: 'a', title: 'Fractured Skies Login Rewards', link: 'https://www.eveonline.com/news', pub: now - 2 * D, kinds: ['login', 'sp', 'event'], endsAt: now + 9 * D, active: true },
      { id: 'b', title: 'Omega and Free PLEX', link: 'https://www.eveonline.com/news', pub: now - 2 * D, kinds: ['free', 'sale'], endsAt: now + 12 * D, active: true },
      { id: 'c', title: 'Fractured Skies Expansion Notes', link: 'https://www.eveonline.com/news', pub: now - 2 * D, kinds: [], endsAt: null, active: false },
      { id: 'd', title: 'Crimson Harvest Intensifies', link: 'https://www.eveonline.com/news', pub: now - 12 * D, kinds: ['login', 'event'], endsAt: now - 1 * D, active: false },
      { id: 'e', title: 'Double Training Weekend', link: 'https://www.eveonline.com/news', pub: now - 20 * D, kinds: ['sp'], endsAt: now - 16 * D, active: false }
    ] } });
  api.daily = { status: async () => st(), done: async () => ({ ok: true, data: true }), allDone: async () => ({ ok: true, data: true }), track: async () => ({ ok: true, data: true }), setGoals: async () => ({ ok: true, data: true }), tickGoal: async () => ({ ok: true, data: true }), save: async c => ({ ok: true, data: c }), news: async () => st() };
  api.appraiseSetPrice = async () => ({ ok: true, data: true });
  {
    const it = (typeId, name, sold, revenue, cost, tax, bought, spent, hold, stock) => ({ typeId, name, sold, revenue, cost, tax, profit: revenue - cost - tax, margin: (revenue - cost - tax) / revenue, avgHoldDays: hold, bought, spent, stock, trades: 3, unmatched: 0 });
    const items = [it(2185, 'Hammerhead II', 1840, 2.21e9, 1.86e9, 74e6, 2100, 2.13e9, 3.2, 260), it(12005, 'Ishtar', 6, 1.68e9, 1.47e9, 57e6, 7, 1.71e9, 5.8, 1),
      it(40520, 'Large Skill Injector', 4, 3.52e9, 3.31e9, 118e6, 5, 4.14e9, 1.4, 1), it(2048, 'Damage Control II', 950, 456e6, 361e6, 15e6, 1000, 380e6, 2.1, 50),
      it(31718, 'Medium Core Defense Field Extender II', 310, 1.04e9, 0.94e9, 35e6, 300, 0.91e9, 6.5, 0), it(3829, 'Ogre II', 200, 152e6, 168e6, 5e6, 400, 336e6, 9.4, 200)];
    items[0].pilots = [{ id: 2119000001, name: 'Richard Fitzwell', sold: 1240, revenue: 1.49e9, profit: 201e6 }, { id: 2119000002, name: 'Mike Hunt', sold: 600, revenue: 0.72e9, profit: 75e6 }];
    items[0].matches = [[2, 'Richard Fitzwell', 200, 200, 1.21e6, [[120, 1.01e6, 'Richard Fitzwell', 4], [80, 1.02e6, 'Mike Hunt', 3]]], [9, 'Mike Hunt', 150, 150, 1.19e6, [[150, 1.0e6, 'Mike Hunt', 2]]], [20, 'Richard Fitzwell', 300, 260, 1.22e6, [[260, 0.99e6, 'Richard Fitzwell', 6]]]]
      .map(([h, seller, qty, matched, price, lots]) => ({ time: new Date(now - h * 3600e3).toISOString(), seller, qty, matched, price, lots: lots.map(([q, p, buyer, dd]) => ({ qty: q, price: p, buyer, time: new Date(now - h * 3600e3 - dd * D).toISOString() })), moreLots: 0, tax: matched * price * 0.0337, profit: matched * price * 0.966 - lots.reduce((n, l) => n + l[0] * l[1], 0) }));
    const daily = Array.from({ length: 30 }, (_, i) => { const v = (Math.sin(i * 1.7) * 0.6 + 0.4) * 60e6 + (i % 7 === 3 ? -45e6 : 0); return { day: new Date(now - (29 - i) * D).toISOString().slice(0, 10), revenue: 300e6, profit: v + 5e6, broker: 5e6, net: v }; });
    const sum = k => items.reduce((n, x) => n + x[k], 0);
    api.trade = { ...api.trade, report: async () => ({ ok: true, data: { days: 30, pooled: true, errors: [], items, daily, ledgerFrom: new Date(now - 74 * D).toISOString(), ledgerCount: 4120,
      totals: { revenue: sum('revenue'), cost: sum('cost'), salesTax: sum('tax'), broker: 148e6, gross: sum('profit'), net: sum('profit') - 148e6, perDay: (sum('profit') - 148e6) / 30, unmatchedQty: 12, unmatchedIsk: 41e6, stockIsk: 2.31e9, trades: 412 } } }) };
    const prod = (typeId, name, rating, share, isk, sellAs = 'refined') => ({ typeId, name, rating, share, iskPerM3: isk, sellAs });
    const moon = (name, region, sec, rating, products) => { const iskPerM3 = products.reduce((n, p) => n + p.iskPerM3 * p.share, 0); return { name, region, security: sec, rating, share: products.reduce((n, p) => n + p.share, 0), products, iskPerM3, monthIsk: iskPerM3 * 14.4e6, extractionIsk: iskPerM3 * 3.36e6 }; };
    const moonData = { opts: { days: 7, m3PerHour: 20000, yieldPct: 87.5, side: 'sell' }, moons: [
      moon('T5ZI-S VII - Moon 3', 'Delve', -0.4, 'R64', [prod(45510, 'Xenotime', 'R64', 0.22, 1910), prod(45495, 'Cobaltite', 'R8', 0.41, 265), prod(45492, 'Bitumens', 'R4', 0.37, 71)]),
      moon('T5ZI-S IV - Moon 1', 'Delve', -0.4, 'R32', [prod(45506, 'Cinnabar', 'R32', 0.3, 980), prod(45493, 'Coesite', 'R4', 0.7, 58)]),
      moon('1DQ1-A II - Moon 5', 'Delve', -0.4, 'R16', [prod(45500, 'Otavite', 'R16', 0.45, 410), prod(45494, 'Sylvite', 'R4', 0.55, 66, 'ore')]),
      moon('8QT-H4 I - Moon 2', 'Delve', -0.3, 'R4', [prod(45492, 'Bitumens', 'R4', 0.6, 71), prod(45491, 'Zeolites', 'R4', 0.4, 63)])
    ] };
    api.moon = { value: async () => ({ ok: true, data: moonData }) };
    const sl = (id, name, price, chargeId, charge) => ({ id, name, price, chargeId: chargeId || null, charge: charge || null, offline: false });
    const fitRes = (cpu, cpuOut, pg, pgOut) => ({ cpu, cpuOut, pg, pgOut, cal: 300, calOut: 400, ok: cpu <= cpuOut && pg <= pgOut });
    api.fit = { check: async () => ({ ok: true, data: { ship: 'Ishtar', shipTypeId: 12005, name: 'Sentry Ishtar', eft: '[Ishtar, Sentry Ishtar]', unknown: [], hasFull: true, requirements: 21,
      slots: {
        high: [sl(4405, 'Drone Link Augmentor II', 4.1e6), sl(4405, 'Drone Link Augmentor II', 4.1e6), { empty: true }, { empty: true }],
        med: [sl(35658, '50MN Y-T8 Compact Microwarpdrive', 1.9e6), sl(2281, 'Multispectrum Shield Hardener II', 6.2e6), sl(3841, 'Large Shield Extender II', 4.4e6), sl(3841, 'Large Shield Extender II', 4.4e6), sl(4421, 'Omnidirectional Tracking Link II', 3.3e6, 32014, 'Optimal Range Script')],
        low: [sl(2048, 'Damage Control II', 1.1e6), sl(4405, 'Drone Damage Amplifier II', 1.6e6), sl(4405, 'Drone Damage Amplifier II', 1.6e6), sl(4405, 'Drone Damage Amplifier II', 1.6e6)],
        rig: [sl(31790, 'Medium Core Defense Field Extender I', 1.1e6), sl(31790, 'Medium Core Defense Field Extender I', 1.1e6), sl(31798, 'Medium Anti-EM Screen Reinforcer I', 0.9e6)], sub: [] },
      drones: [{ id: 28211, name: 'Garde II', qty: 4 }, { id: 2185, name: 'Hammerhead II', qty: 5 }], cargo: [{ id: 28668, name: 'Nanite Repair Paste', qty: 50 }],
      slotCheck: { high: { used: 2, max: 4 }, med: { used: 5, max: 5 }, low: { used: 4, max: 4 }, rig: { used: 3, max: 3 }, turrets: { used: 0, max: 0 }, launchers: { used: 0, max: 0 }, problems: [] },
      allV: fitRes(370.1, 412.5, 1061, 1124),
      pilots: [{ id: 2119000001, name: 'Richard Fitzwell', canFly: true, minutes: 0, fitting: fitRes(370.1, 412.5, 1061, 1124) },
        { id: 2119000002, name: 'Mike Hunt', canFly: false, minutes: 27 * 1440, missing: [{ name: 'Heavy Assault Cruisers', level: 1 }], fitting: fitRes(389.6, 385, 1104, 1080) },
        { id: 2119000004, name: 'Wayne Kerr', canFly: true, minutes: 0, fitting: fitRes(370.1, 412.5, 1061, 1124) },
        { id: 2119000005, name: 'Jack Mehoff', canFly: false, minutes: 64 * 1440, missing: [{ name: 'Gallente Cruiser', level: 5 }], fitting: fitRes(389.6, 357.5, 1104, 1036) }],
      hull: { hp: { shield: 2150, armor: 1950, hull: 2250 }, resists: { shield: [0, 0.2, 0.4, 0.5], armor: [0.5, 0.35, 0.25, 0.1], hull: [0.33, 0.33, 0.33, 0.33] }, ehp: 9470, velocity: 210, align: 8.1, cargo: 420, droneBay: 375, bandwidth: 125, sig: 155, lockRange: 60000, scanRes: 250, maxLocked: 7, cap: 1750, capRecharge: 494 },
      cost: { hull: 268e6, total: 312e6, fittings: 44e6 },
      engine: (() => { const mk = (k) => ({ dps: 507.1 * k, dpsReload: 507.1 * k, droneDps: 507.1 * k, weaponDps: 0, volley: 2028 * k, ehp: 48183 * (0.8 + 0.2 * k), layers: { shield: 36045 * (0.8 + 0.2 * k), armor: 4986, hull: 7152 }, hp: { shield: 10911 * (0.8 + 0.2 * k), armor: 2000, hull: 2875 },
        resists: { shield: [0.563, 0.764, 0.911, 0.705], armor: [0.575, 0.724, 0.862, 0.235], hull: [0.598, 0.598, 0.598, 0.598] }, rep: { shield: 0, armor: 0, hull: 0, passive: 110 },
        cap: { amount: 1312.5, recharge: 198.8, stable: false, stableAt: 0, lastsSeconds: 860, delta: -0.19 }, speed: 1546, align: 8.2, sig: 743, lockRange: 75000, scanRes: 367, maxTargets: 7,
        propOff: { speed: 175, sig: 233, cap: { amount: 1050, recharge: 265, stable: true, stableAt: 83, lastsSeconds: null } }, cpu: { used: 407, out: 425 }, pg: { used: 382, out: 925 }, violations: [] });
        return { allV: mk(1), pilots: { 2119000001: mk(1), 2119000004: mk(0.86) }, error: null }; })() } }) };
    api.pi.nearby = async o => {
      const types = o.types || ['Barren', 'Temperate'];
      const sys = [['1DQ1-A', 0, -0.4, { Barren: 2, Gas: 3, Ice: 1, Lava: 1, Storm: 1 }], ['8QT-H4', 1, -0.4, { Barren: 3, Temperate: 1, Gas: 2, Oceanic: 1 }], ['T5ZI-S', 2, -0.2, { Temperate: 2, Barren: 1, Plasma: 1, Gas: 4 }],
        ['Q-02UL', 2, -0.3, { Lava: 2, Storm: 1, Gas: 2 }], ['K-6K16', 3, -0.3, { Barren: 1, Temperate: 1, Ice: 1, Gas: 3 }], ['NOL-M9', 3, -0.6, { Plasma: 2, Barren: 2, Storm: 1 }], ['PR-8CN', 4, -0.5, { Temperate: 3, Oceanic: 1, Gas: 2 }],
        ['MJXW-P', 4, -0.4, { Barren: 4, Lava: 1 }], ['KBAK-I', 5, -0.7, { Temperate: 1, Barren: 1, Ice: 2 }], ['YZ9-F6', 5, -0.3, { Gas: 5, Storm: 2 }], ['GY6A-L', 6, -0.2, { Temperate: 2, Barren: 2, Plasma: 1 }]];
      const rows = sys.map(([name, jumps, security, planets], i) => { const counts = Object.fromEntries(types.map(t => [t, planets[t] || 0])); return { id: 30004759 + i, name, jumps, security, region: 'Delve', counts, planets, matching: Object.values(counts).reduce((a, b) => a + b, 0), typesMatched: Object.values(counts).filter(Boolean).length }; })
        .filter(r => o.all ? r.typesMatched === types.length : r.typesMatched > 0);
      const nearest = Object.fromEntries(types.map(t => { const r = rows.find(x => x.counts[t]); return [t, r ? { name: r.name, jumps: r.jumps } : null]; }));
      return { ok: true, data: { from: '1DQ1-A', types, all: !!o.all, jumps: o.jumps || 10, searched: 214, nearest, rows, more: 0 } };
    };
    const g = (cat, rows) => [cat, rows.map(([name, text, typeId]) => ({ name, text, typeId: typeId || null }))];
    api.items = {
      search: async () => ({ ok: true, data: [[12005, 'Ishtar', 'Heavy Assault Cruiser'], [17843, 'Vexor Navy Issue', 'Cruiser'], [627, 'Vexor', 'Cruiser'], [12011, 'Eagle', 'Heavy Assault Cruiser'], [29990, 'Loki', 'Strategic Cruiser']].map(([id, name, group]) => ({ id, name, group })) }),
      info: async () => ({ ok: true, data: { id: 12005, name: 'Ishtar', group: 'Heavy Assault Cruiser', category: 'Ship', meta: 'Tech II', volume: 10000, portion: 1, basePrice: 0, published: true, onMarket: true, hasStats: true,
        prices: [['Jita', 268e6, 255e6, 41], ['Amarr', 281e6, 240e6, 9], ['Dodixie', 279e6, 229e6, 6], ['Rens', 295e6, 210e6, 3], ['Hek', 301e6, 205e6, 2]].map(([hub, sell, buy, sellVolume]) => ({ hub, sell, buy, sellVolume })),
        requirements: [{ id: 3339, name: 'Gallente Cruiser', level: 5 }, { id: 16591, name: 'Heavy Assault Cruisers', level: 1 }],
        build: { blueprint: 'Ishtar Blueprint', activity: 'manufacturing', time: 18000, perRun: 1, materials: [[11545, 'Ion Thruster', 225], [11549, 'Tesseract Capacitor Unit', 300], [11553, 'Plasma Thruster', 34], [11557, 'Fusion Reactor Unit', 18], [627, 'Vexor', 1], [11399, 'Morphite', 240], [11538, 'Nanoelectrical Microprocessor', 1800], [11537, 'Linear Shield Emitter', 900]].map(([id, name, qty]) => ({ id, name, qty })) },
        matCost: 231e6, reprocess: null, usedIn: [],
        attrs: Object.fromEntries([
          g('Fitting', [['High Slots', '4'], ['Medium Slots', '4'], ['Low Slots', '6'], ['CPU Output', '375 tf'], ['Powergrid Output', '920 MW'], ['Calibration', '400'], ['Rig Slots', '2']]),
          g('Shield', [['Shield Capacity', '1,875 HP'], ['Shield EM Damage Resistance', '0%'], ['Shield Thermal Damage Resistance', '20%'], ['Shield Recharge Time', '1,250 s']]),
          g('Armor', [['Armor Hitpoints', '2,500 HP'], ['Armor EM Damage Resistance', '50%'], ['Armor Kinetic Damage Resistance', '35%']]),
          g('Drones', [['Drone Capacity', '375 m3'], ['Drone Bandwidth', '125 Mbit/sec']]),
          g('Navigation', [['Maximum Velocity', '190 m/sec'], ['Inertia Modifier', '0.43 x'], ['Warp Speed', '3 AU/s']])
        ]) } })
    };
    api.systemCard = async q => ({ ok: true, data: String(q).startsWith('J') ? { id: 31000101, name: 'J152701', security: -1, region: 'C-R00012', regionId: 11000012, constellation: 'C-C00121', wspace: true, pochven: false, kills: { ship: 2, pod: 1, npc: 41 }, jumps: 0, sov: null,
        wh: { id: 31000101, name: 'J152701', cls: 'C3', region: 'C-R00012', effect: 'Wolf-Rayet', effectSummary: 'More armour HP, more small weapon damage, less shield resists', statics: [{ code: 'D845', leadsTo: 'HS', lifeHours: 24, totalMass: 5e9, jumpMass: 375e6 }], shattered: false, staticsKnown: true },
        planets: { Barren: 3, Gas: 2, Lava: 1, Temperate: 1 }, gates: [] }
      : { id: 30004759, name: '1DQ1-A', security: -0.38, region: 'Delve', regionId: 10000060, constellation: '1P-VL2', wspace: false, pochven: false, kills: { ship: 7, pod: 4, npc: 112 }, jumps: 1840, sov: { id: 1354830081, name: 'Goonswarm Federation' }, wh: null,
        planets: { Barren: 2, Gas: 3, Ice: 1, Lava: 1, Storm: 1 }, gates: [{ id: 30004760, name: '8QT-H4', security: -0.42, region: 'Delve' }, { id: 30004761, name: 'NOL-M9', security: -0.55, region: 'Delve' }, { id: 30004762, name: 'T5ZI-S', security: -0.21, region: 'Delve' }, { id: 30004763, name: 'Y-2ANO', security: -0.33, region: 'Delve' }] } });
    const BIP = { 12005: 268e6, 2185: 1.2e6, 19720: 1.98e9, 31718: 3.4e6, 2048: 0.69e6, 29990: 380e6 };
    const bi = (id, name, qty) => ({ id, name, qty, sell: (BIP[id] || 1e6) * qty, buy: (BIP[id] || 1e6) * qty * 0.93 });
    api.bargains = { scan: async () => ({ ok: true, data: { regionId: 10000002, total: 18240, read: 6420, newlyRead: 400, unread: 11820, failed: 0, rows: [
      { id: 1, items: [bi(12005, 'Ishtar', 1), bi(2185, 'Hammerhead II', 10)], itemCount: 2, price: 190e6, wantCost: 0, sellVal: 280e6, buyVal: 266e6, profitSell: 90e6, profitBuy: 76e6, pct: 0.32, system: 'Perimeter', security: 0.95, volume: 10050, suspicious: false, bpcs: 0, title: 'Ishtar + drones, moving out' },
      { id: 2, items: [bi(19720, 'Revelation', 1)], itemCount: 1, price: 1.55e9, wantCost: 0, sellVal: 1.98e9, buyVal: 1.81e9, profitSell: 430e6, profitBuy: 260e6, pct: 0.22, system: 'Jita', security: 0.95, volume: 1300000, suspicious: false, bpcs: 0, title: '' },
      { id: 3, items: [bi(31718, 'Medium Core Defense Field Extender II', 8), bi(2048, 'Damage Control II', 20)], itemCount: 6, price: 18e6, wantCost: 0, sellVal: 41e6, buyVal: 33e6, profitSell: 23e6, profitBuy: 15e6, pct: 0.56, system: 'Sobaseki', security: 0.8, volume: 120, suspicious: false, bpcs: 0, title: 'hangar clear' },
      { id: 4, items: [bi(29990, 'Loki', 1)], itemCount: 5, price: 120e6, wantCost: 0, sellVal: 640e6, buyVal: 590e6, profitSell: 520e6, profitBuy: 470e6, pct: 0.81, system: 'Josameto', security: 0.7, volume: 10000, suspicious: true, bpcs: 0, title: 'quick sale' },
      { id: 5, items: [bi(2185, 'Hammerhead II', 500)], itemCount: 1, price: 380e6, wantCost: 120e6, sellVal: 610e6, buyVal: 550e6, profitSell: 110e6, profitBuy: 50e6, pct: 0.18, system: 'New Caldari', security: 1.0, volume: 2500, suspicious: true, wants: 1, bpcs: 0, title: '' }
    ] } }) };
    const notable = (...l) => l.map(label => ({ label, skill: label, level: 5 }));
    api.charValue = async () => ({ ok: true, data: { prices: { lsiSell: 862e6, lsiBuy: 851e6, extractor: 402e6, perExtract: 420e6, tax: 0.0337 }, rows: [
      { id: 2119000001, name: 'Richard Fitzwell', totalSp: 128.45e6, unallocated: 0, fives: 212, extractable: 246, extractValue: 246 * 420e6, injectCost: 421 * 862e6, notable: notable('Carrier', 'Jump Drive Calibration', 'Logistics') },
      { id: 2119000002, name: 'Mike Hunt', totalSp: 46.21e6, unallocated: 0, fives: 61, extractable: 82, extractValue: 82 * 420e6, injectCost: 10 + 102.6 * 862e6, notable: notable('Exhumers', 'Rorqual') },
      { id: 2119000003, name: 'Hugh Jayness', totalSp: 12.8e6, unallocated: 250000, fives: 9, extractable: 16, extractValue: 16 * 420e6, injectCost: 29.5 * 862e6, notable: [] },
      { id: 2119000004, name: 'Wayne Kerr', totalSp: 88.4e6, unallocated: 0, fives: 140, extractable: 166, extractValue: 166 * 420e6, injectCost: 268 * 862e6, notable: notable('Cyno V', 'Black Ops') },
      { id: 2119000005, name: 'Jack Mehoff', totalSp: 21.9e6, unallocated: 0, fives: 32, extractable: 33, extractValue: 33 * 420e6, injectCost: 52.25 * 862e6, notable: notable('Jump Freighter') }
    ] } });
    globalThis.__moonDemo = moonData;
  }
  const plex = 5.42e6, lsiNet = 862e6 * (1 - 0.0337), ext = 402e6, per = lsiNet - ext;
  const fp = [[2119000001, 'Richard Fitzwell', 128450210, 'Drone Interfacing V', 2700, 'paid'], [2119000002, 'Mike Hunt', 46210980, 'Exhumers IV', 2250, 'omega'], [2119000003, 'Hugh Jayness', 12800440, null, 0, 'skip'],
    [2119000004, 'Wayne Kerr', 88400120, 'Interdictors V', 2700, 'mct'], [2119000005, 'Jack Mehoff', 21900800, 'Freighter IV', 2700, 'mct']];
  api.farm = {
    calc: async () => {
      const pilots = fp.map(([id, name, totalSp, training, rate, slot]) => { const spMonth = rate * 720, ex = spMonth / 5e5, plexCost = slot === 'omega' ? 500 : slot === 'mct' ? 350 : 0, cost = slot === 'skip' ? 0 : plexCost * plex, rev = slot === 'skip' ? 0 : ex * per;
        return { id, name, totalSp, training, spPerHour: rate, spPerDay: rate * 24, spMonth, extractions: ex, slot, plexCost, costIsk: cost, revenue: rev, profit: rev - cost, aboveMin: totalSp >= 5.5e6, extractable: Math.max(0, Math.floor((totalSp - 5.5e6) / 5e5) + 1) }; });
      const live = pilots.filter(p => p.slot !== 'skip');
      return { ok: true, data: { cfg: { omegaPlex: 500, mctPlex: 350, salesTax: 3.37, brokerFee: 1.5, sellMode: 'buy', slots: {} }, prices: { plex, lsiGross: 862e6, lsiNet, extCost: ext, perExtraction: per, fees: 0.0337 },
        pilots, totals: { revenue: live.reduce((n, p) => n + p.revenue, 0), cost: live.reduce((n, p) => n + p.costIsk, 0), profit: live.reduce((n, p) => n + p.profit, 0), extractions: live.reduce((n, p) => n + p.extractions, 0) } } };
    },
    save: async c => ({ ok: true, data: c }),
    insurance: async () => ({ ok: true, data: { unknown: [], rows: [
      { pilot: 'Richard Fitzwell', typeId: 12005, type: 'Ishtar', shipName: 'Drone Boat', hull: 268e6, levels: [{ name: 'Basic', cost: 9.1e6, payout: 45.6e6 }, { name: 'Gold', cost: 27.4e6, payout: 91.3e6 }, { name: 'Platinum', cost: 45.6e6, payout: 152e6, net: 106.4e6 }], platinum: { name: 'Platinum', cost: 45.6e6, payout: 152e6, net: 106.4e6 }, coverPct: 0.397, verdict: 'Marginal' },
      { pilot: 'Mike Hunt', typeId: 22544, type: 'Hulk', shipName: 'Rock Muncher', hull: 292e6, levels: [{ name: 'Platinum', cost: 66e6, payout: 220e6 }], platinum: { name: 'Platinum', cost: 66e6, payout: 220e6, net: 154e6 }, coverPct: 0.527, verdict: 'Worth it' },
      { pilot: 'Wayne Kerr', typeId: 22456, type: 'Sabre', shipName: 'Bubble Trouble', hull: 61e6, levels: [{ name: 'Platinum', cost: 9e6, payout: 30e6 }], platinum: { name: 'Platinum', cost: 9e6, payout: 30e6, net: 21e6 }, coverPct: 0.344, verdict: 'Marginal' },
      { pilot: 'Jack Mehoff', typeId: 20185, type: 'Charon', shipName: 'Wide Load', hull: 1.42e9, levels: [{ name: 'Platinum', cost: 330e6, payout: 1.1e9 }], platinum: { name: 'Platinum', cost: 330e6, payout: 1.1e9, net: 770e6 }, coverPct: 0.542, verdict: 'Worth it' },
      { pilot: null, typeId: 17918, type: 'Rattlesnake', hull: 318e6, levels: [{ name: 'Platinum', cost: 54e6, payout: 180e6 }], platinum: { name: 'Platinum', cost: 54e6, payout: 180e6, net: 126e6 }, coverPct: 0.396, verdict: 'Marginal' }
    ] } })
  };
})();

// ---- Mocks for the comms, assets, ores and EVE settings batch ----
{ chars.forEach((c, i) => Object.assign(c, { canWrite: i < 3, canSendMail: i < 3, canSaveFits: i < 3, canRespond: i < 3 }));
  const SC = ['esi-skills.read_skills.v1', 'esi-skills.read_skillqueue.v1', 'esi-wallet.read_character_wallet.v1', 'esi-assets.read_assets.v1', 'esi-mail.read_mail.v1', 'esi-calendar.read_calendar_events.v1', 'esi-location.read_location.v1', 'esi-industry.read_character_jobs.v1', 'esi-planets.manage_planets.v1', 'esi-killmails.read_killmails.v1', 'esi-markets.read_character_orders.v1', 'esi-universe.read_structures.v1'];
  api.info = async () => ({ ok: true, data: { version: '1.10.0', os: 'Windows 11 Pro (10.0.26100)', electron: '38.8.6', userData: 'C:\\Users\\Capsuleer\\AppData\\Roaming\\EVE Toolkit', scopes: SC, uiScopes: ['esi-ui.write_waypoint.v1', 'esi-ui.open_window.v1'], writeScopes: ['esi-mail.send_mail.v1', 'esi-mail.organize_mail.v1', 'esi-calendar.respond_calendar_events.v1', 'esi-fittings.write_fittings.v1'], corpScopes: [] } });
  const who = ['Richard Fitzwell', 'Mike Hunt', 'Hugh Jayness'];
  const inbox = [['Loose Cannons Coalition', 'CTA: Sunday fleet 0900 EVE time', 0, 1, ['Mike Hunt', 'Hugh Jayness']], ['Mike Hunt', 'Moon mining schedule for next week', 0, 1, []], ['Dee Fender', 'Your structure is low on fuel: Athanor', 2, 4, []],
    ['Hugh Jayness', 'Re: Freight run to Perimeter', 0, 10, []], ['Bill Board', 'WTB Ishtar fits', 1, 26, []], ['Deep Pockets Salvage', 'Monthly corp tax summary', 0, 30, ['Mike Hunt']], ['CONCORD', 'Your contract has been completed', 1, 77, []], ['Sal Monella', 'Recruitment: welcome aboard', 2, 120, []]]
    .map(([f, s, w, h, also], i) => ({ mail_id: 600 + i, charId: chars[w].id, pilot: who[w], fromName: f, subject: s, is_read: h > 8, timestamp: iso(now - h * H), alsoTo: also, from: 1 }));
  const mb0 = api.mailBody; api.mailBody = async (c, id) => { const m = inbox.find(x => x.mail_id === id); if (!m) return mb0(c, id);
    return { ok: true, data: { ...m, recipientNames: ['Richard Fitzwell', 'Mike Hunt', 'Hugh Jayness'], body: 'All pilots,<br><br>Sunday strat-op forms at 0900 EVE time in Perimeter. Doctrine is Ishtars; logi pilots bring Guardians.<br><br>Check your fits against the doctrine in EVE Toolkit before you undock.<br><br>o7<br>Coalition command' } }; };
  api.comms = { inbox: async () => ({ ok: true, data: { mails: inbox, unread: inbox.filter(m => !m.is_read).length, errors: [] } }), send: async (_c, m) => ({ ok: true, data: { to: String(m.to).split(',') } }), markRead: async () => ({ ok: true, data: true }), respond: async () => ({ ok: true, data: true }) };
  api.backup = { create: async () => ({ ok: true, data: null }), pick: async () => ({ ok: true, data: null }), describe: async () => ({ ok: true, data: {} }), restore: async () => ({ ok: true, data: {} }) };
  const AF_LOC = [
    ['Jita IV - Moon 4 - Caldari Navy Assembly Plant', 'Jita', 0.95, 'The Forge', 0, 0, [[12005, 'Ishtar', 'Heavy Assault Cruiser', 2, 5.4e8, 20000], [2185, 'Hammerhead II', 'Combat Drone', 40, 4.4e7, 400], [44992, 'PLEX', 'Pilot Services', 500, 2.1e9, 6]]],
    ['Perimeter - Tranquility Trading Tower', 'Perimeter', 0.95, 'The Forge', 1, 1, [[22544, 'Hulk', 'Exhumer', 1, 2.9e8, 3750], [16278, 'Ice Harvester II', 'Strip Miner', 2, 1.6e7, 50]]],
    ['Amarr VIII (Oris) - Emperor Family Academy', 'Amarr', 1.0, 'Domain', 9, 2, [[2185, 'Hammerhead II', 'Combat Drone', 15, 1.65e7, 150], [17738, 'Machariel', 'Battleship', 1, 4.1e8, 50000]]],
    ['Dodixie IX - Moon 20 - Federation Navy Assembly Plant', 'Dodixie', 0.87, 'Sinq Laison', 15, 3, [[2185, 'Hammerhead II', 'Combat Drone', 5, 5.5e6, 50], [34, 'Tritanium', 'Mineral', 2400000, 9.8e6, 24000]]],
    ['T5ZI-S - Sanctuary of the Gentle Deer', 'T5ZI-S', -0.21, 'Tenal', 31, 0, [[2185, 'Hammerhead II', 'Combat Drone', 10, 1.1e7, 100], [20185, 'Charon', 'Freighter', 1, 1.42e9, 870000]]],
    ['J152701 - Home POS', 'J152701', -1, 'C-R00012', null, 4, [[2185, 'Hammerhead II', 'Combat Drone', 20, 2.2e7, 200]]]];
  const afGroups = (q, from) => AF_LOC.map(([location, system, security, region, jumps, pi, items], k) => {
    const its = items.filter(i => !q || (i[1] + ' ' + i[2]).toLowerCase().includes(q.toLowerCase())).map(([typeId, name, group, qty, value, volume]) => ({ typeId, name, group, qty, value, volume }));
    return { key: k + ':' + location, charId: chars[pi].id, pilot: chars[pi].name, location, system, security, region, jumps: from ? jumps : null, items: its, itemCount: its.length, value: its.reduce((n, i) => n + i.value, 0), volume: its.reduce((n, i) => n + i.volume, 0) };
  }).filter(g => g.items.length);
  api.assetFinder = {
    search: async o => { let g = afGroups(o.q, o.from); g.sort(o.from ? (a, b) => (a.jumps ?? 999) - (b.jumps ?? 999) : (a, b) => b.value - a.value);
      return { ok: true, data: { at: now - 22 * 60e3, errors: [], from: o.from ? 'Jita' : null, groups: g, totalGroups: g.length, matched: g.reduce((n, x) => n + x.itemCount, 0), value: g.reduce((n, x) => n + x.value, 0), volume: g.reduce((n, x) => n + x.volume, 0), pilots: [] } }; },
    consolidate: async o => { const g = afGroups(o.q, true); const trips = g.filter(x => x.system !== 'Jita' && x.jumps !== null).sort((a, b) => a.jumps - b.jumps);
      return { ok: true, data: { to: 'Jita', trips, unreachable: g.filter(x => x.jumps === null), here: 1, volume: trips.reduce((n, x) => n + x.volume, 0), value: trips.reduce((n, x) => n + x.value, 0), maxJumps: Math.max(...trips.map(x => x.jumps)) } }; } };
  const ORE = [[46689, 'Dense Veldspar', 'Veldspar', 182, 196, 171], [17470, 'Azure Plagioclase', 'Plagioclase', 214, 238, 229], [46682, 'Bright Spodumain', 'Spodumain', 296, 331, 318], [17867, 'Glazed Hedbergite', 'Hedbergite', 262, 270, 289],
    [46675, 'Iridescent Gneiss', 'Gneiss', 248, 275, 262], [17459, 'Fiery Kernite', 'Kernite', 231, 262, 244], [46687, 'Shimmering Crokite', 'Crokite', 341, 390, 372], [46679, 'Prismatic Gneiss', 'Gneiss', 251, 281, 266],
    [17865, 'Luminous Kernite', 'Kernite', 220, 245, 241], [46677, 'Onyx Ochre', 'Dark Ochre', 288, 309, 301], [17453, 'Viscous Pyroxeres', 'Pyroxeres', 159, 176, 168], [17460, 'Concentrated Veldspar', 'Veldspar', 166, 181, 158]];
  const MAT = [[34, 'Tritanium'], [35, 'Pyerite'], [36, 'Mexallon'], [37, 'Isogen']];
  api.ind.ores = async o => ({ ok: true, data: { family: o.family || 'ore', yield: 0.7238, side: o.side || 'buy', hub: o.hub || 'Jita', rows: ORE.map(([typeId, name, group, raw, comp, rep]) => {
    const best = Math.max(raw, comp, rep); const vol = /Spodumain|Crokite|Ochre/.test(group) ? 16 : /Gneiss|Hedbergite/.test(group) ? 5 : /Kernite|Plagioclase/.test(group) ? 1.2 : 0.1;
    return { typeId, name, group, volume: vol, portion: 100, raw, compressed: comp, reprocessed: rep, best, verdict: best === rep ? 'reprocess' : best === comp ? 'compress' : 'raw', perHour: o.m3PerHour ? best * o.m3PerHour : null,
      materials: MAT.slice(0, 2 + (typeId % 3)).map(([id, n], k) => ({ typeId: id, name: n, qty: Math.round(400 / (k + 1) * (1 + (typeId % 5) / 10)), value: Math.round(1800 / (k + 1)) })) }; }).sort((a, b) => b.best - a.best) } });
  const prof = 'C:\\Users\\Capsuleer\\AppData\\Local\\CCP\\EVE\\c_eve_sharedcache_tq_tranquility\\settings_Default';
  const ES = { roots: [], running: false, installs: [{ name: 'c_eve_sharedcache', server: 'Tranquility', profiles: [{ name: 'Default', dir: prof,
    chars: chars.map((c, i) => ({ id: c.id, name: c.name, mine: true, file: `core_char_${c.id}.dat`, modified: now - [2, 30, 50, 300, 4000][i] * 60e3 * 6, size: 210000 + i * 7311 })).concat([{ id: 2119999001, name: 'Old Alt Retired', mine: false, modified: now - 210 * D, size: 98000 }]),
    users: [{ id: 8812231, label: 'Main account', modified: now - 12 * 60e3, size: 41000 }, { id: 9120044, label: 'Alts', modified: now - 3 * D, size: 39000 }, { id: 7100562, label: '', modified: now - 90 * D, size: 36000 }] },
    { name: 'Mining', dir: prof.replace('Default', 'Mining'), chars: [], users: [] }] }] };
  api.eveSettings = { list: async () => ({ ok: true, data: ES }), backups: async () => ({ ok: true, data: [{ id: 'b1', at: now - 2 * D, kind: 'char', files: [1, 2, 3] }] }), copy: async o => ({ ok: true, data: { copied: o.to.length, backup: 'b2' } }), restore: async () => ({ ok: true, data: { restored: 3 } }), label: async () => ({ ok: true, data: true }) };
}
contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('__mock', { sdeCheck: v => { globalThis.__sdeCheck = v; } });

