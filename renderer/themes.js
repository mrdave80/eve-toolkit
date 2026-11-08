// Theme system. Each theme sets the core palette; everything else in styles.css derives from these.
const THEME_KEYS = ['bg', 'bg-2', 'panel', 'panel-2', 'line', 'line-2', 'text', 'muted', 'dim', 'accent', 'accent-2', 'on-accent',
  'gold', 'red', 'green', 'blue', 'purple', 'orange', 'canvas', 'node'];

const THEMES = [
  { id: 'capsuleer', name: 'Capsuleer', tags: ['Default', 'Any space'], blurb: 'The original teal HUD. Easy on the eyes for long sessions.',
    c: { bg: '#0a0e13', 'bg-2': '#0f151c', panel: '#121a23', 'panel-2': '#17212c', line: '#22303e', 'line-2': '#2c3d4f', text: '#d6e2ee', muted: '#7d8fa3', dim: '#56677a',
      accent: '#4fd1c5', 'accent-2': '#81e6d9', 'on-accent': '#062421', gold: '#e8b64c', red: '#f56565', green: '#68d391', blue: '#63b3ed', purple: '#b794f4', orange: '#ed8936', canvas: '#0c1218', node: '#141d27' } },

  { id: 'concord', name: 'Concord Highsec', tags: ['Highsec', 'PvE', 'Missions'], blurb: 'Clean law-enforcement blue for mission runners, haulers and new pilots.',
    c: { bg: '#090e18', 'bg-2': '#0d1422', panel: '#111b2d', 'panel-2': '#162238', line: '#22314d', 'line-2': '#2d4063', text: '#dbe6f7', muted: '#8597b8', dim: '#5a6b8c',
      accent: '#5aa9ff', 'accent-2': '#a6d1ff', 'on-accent': '#051327', gold: '#f0c35a', red: '#ff6b6b', green: '#6fdc9a', blue: '#7fc4ff', purple: '#b39cff', orange: '#ff9f4a', canvas: '#0b1220', node: '#142036' } },

  { id: 'amarr', name: 'Imperial Gold', tags: ['Highsec', 'PvE', 'Incursions'], blurb: 'Gilded bronze and parchment, for pilots of the Empire and incursion fleets.',
    c: { bg: '#110d08', 'bg-2': '#17110a', panel: '#1d160e', 'panel-2': '#241b11', line: '#3a2c1a', 'line-2': '#4d3a22', text: '#f1e6cf', muted: '#ad9878', dim: '#7a6a52',
      accent: '#e2b453', 'accent-2': '#f6d88f', 'on-accent': '#2a1c04', gold: '#ffd36b', red: '#f2675a', green: '#9ccf6a', blue: '#7fb3d9', purple: '#c79ae6', orange: '#ef8f3c', canvas: '#140f09', node: '#221a10' } },

  { id: 'caldari', name: 'State Steel', tags: ['Highsec', 'Trading', 'Industry'], blurb: 'Cold corporate graphite and ice blue. Built for spreadsheets and market PvP.',
    c: { bg: '#0c0f12', 'bg-2': '#11151a', panel: '#161b21', 'panel-2': '#1c222a', line: '#2a323c', 'line-2': '#36404c', text: '#dde4ea', muted: '#8b97a3', dim: '#5f6a76',
      accent: '#7fc8f8', 'accent-2': '#bfe4fc', 'on-accent': '#04131f', gold: '#e6c069', red: '#f06a6a', green: '#72d39b', blue: '#8fb4ff', purple: '#b8a2f0', orange: '#ee9a52', canvas: '#0e1216', node: '#1a2027' } },

  { id: 'gallente', name: 'Federation Verdant', tags: ['Highsec', 'Lowsec', 'Exploration'], blurb: 'Deep greens with a soft glow, for explorers and drone pilots.',
    c: { bg: '#08110e', 'bg-2': '#0c1714', panel: '#101e19', 'panel-2': '#152620', line: '#20372e', 'line-2': '#2b483c', text: '#d7ece2', muted: '#83a596', dim: '#587668',
      accent: '#5fd38a', 'accent-2': '#a9f0c3', 'on-accent': '#04200f', gold: '#e5c45a', red: '#f26d6d', green: '#7de8a4', blue: '#6cc0e8', purple: '#b59cf2', orange: '#ec9850', canvas: '#0a1512', node: '#13231d' } },

  { id: 'minmatar', name: 'Rust Republic', tags: ['Lowsec', 'PvP', 'Faction Warfare'], blurb: 'Scrap-metal rust and ember orange. Small-gang and faction warfare energy.',
    c: { bg: '#110b09', 'bg-2': '#170f0c', panel: '#1e1410', 'panel-2': '#261a15', line: '#3d2a22', 'line-2': '#50382d', text: '#eedcd2', muted: '#ab9083', dim: '#7a6258',
      accent: '#e8743e', 'accent-2': '#f7a878', 'on-accent': '#2a0f03', gold: '#f2c14e', red: '#ff5d5d', green: '#8fd47a', blue: '#79b4d9', purple: '#c49ae0', orange: '#ffa75c', canvas: '#140d0a', node: '#231814' } },

  { id: 'nullsec', name: 'Sov Bloc', tags: ['Nullsec', 'Fleets', 'PvP'], blurb: 'Near-black with fleet-red highlights, for sov holders, FCs and structure timers.',
    c: { bg: '#09090d', 'bg-2': '#0e0e14', panel: '#13131b', 'panel-2': '#191924', line: '#272736', 'line-2': '#343447', text: '#e4e3ee', muted: '#8f8ea6', dim: '#626178',
      accent: '#ff4d5e', 'accent-2': '#ff919b', 'on-accent': '#2b0308', gold: '#f2bf4e', red: '#ff7a45', green: '#5fd68f', blue: '#6aa8ff', purple: '#b18cff', orange: '#ff9a4a', canvas: '#0b0b10', node: '#181822' } },

  { id: 'wormhole', name: 'J-Space Void', tags: ['Wormholes', 'Exploration', 'PvP'], blurb: 'Violet nebula over deep black. No local, no stargates, no problem.',
    c: { bg: '#09070f', 'bg-2': '#0e0a17', panel: '#140f20', 'panel-2': '#1a1429', line: '#2a2140', 'line-2': '#382c55', text: '#e4dcf6', muted: '#978bb8', dim: '#685d88',
      accent: '#a979ff', 'accent-2': '#d3b9ff', 'on-accent': '#17062e', gold: '#f0c35a', red: '#ff6b8a', green: '#6be0a8', blue: '#77b7ff', purple: '#e08cff', orange: '#ff9e5e', canvas: '#0b0814', node: '#191327' } },

  { id: 'abyssal', name: 'Abyssal Crimson', tags: ['PvP', 'Abyss', 'Pochven'], blurb: 'Black and blood-red, inspired by the Abyss and Pochven. Aggressive and high contrast.',
    c: { bg: '#070505', 'bg-2': '#0d0808', panel: '#130b0b', 'panel-2': '#1a0f0f', line: '#2e1717', 'line-2': '#3f1f1f', text: '#f2e1e1', muted: '#a88a8a', dim: '#795e5e',
      accent: '#e5323f', 'accent-2': '#ff7b84', 'on-accent': '#ffffff', gold: '#f3b94d', red: '#ff7446', green: '#6fd69a', blue: '#7aaee8', purple: '#c58cf0', orange: '#ff9654', canvas: '#0a0606', node: '#180e0e' } },

  { id: 'industrialist', name: 'Ore Hauler', tags: ['PvE', 'Mining', 'Industry'], blurb: 'Warm amber on charcoal, for miners, industrialists and PI barons.',
    c: { bg: '#0e0d0a', 'bg-2': '#13120d', panel: '#1a1811', 'panel-2': '#211f16', line: '#353223', 'line-2': '#47422e', text: '#ece6d6', muted: '#a69f88', dim: '#77715d',
      accent: '#f2a93b', 'accent-2': '#ffd27a', 'on-accent': '#2a1902', gold: '#ffe07a', red: '#f26a5a', green: '#9bd46a', blue: '#7ab6d6', purple: '#c09ae0', orange: '#ff8f3d', canvas: '#11100c', node: '#1f1d15' } },

  { id: 'daylight', name: 'Station Lights', tags: ['Light mode', 'Any space'], blurb: 'A bright theme for daytime use or well-lit rooms.',
    c: { bg: '#eef2f6', 'bg-2': '#e3e9ef', panel: '#ffffff', 'panel-2': '#f5f8fb', line: '#d5dde6', 'line-2': '#bfcbd8', text: '#17222e', muted: '#52657b', dim: '#7c8da1',
      accent: '#0f8f86', 'accent-2': '#38b6ab', 'on-accent': '#ffffff', gold: '#a86f05', red: '#c53030', green: '#2f855a', blue: '#2b6cb0', purple: '#6b46c1', orange: '#c05621', canvas: '#e9eef3', node: '#ffffff' } }
];

const LOCATION_LABELS = { hs: 'Highsec', ls: 'Lowsec', ns: 'Nullsec', wh: 'Wormhole space', pochven: 'Pochven' };
const LOCATION_DEFAULTS = { hs: 'concord', ls: 'minmatar', ns: 'nullsec', wh: 'wormhole', pochven: 'abyssal' };

const themeById = id => THEMES.find(t => t.id === id) || THEMES[0];

function applyTheme(id, accent) {
  const t = themeById(id);
  const root = document.documentElement.style;
  for (const k of THEME_KEYS) root.setProperty('--' + k, t.c[k]);
  if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) {
    root.setProperty('--accent', accent);
    root.setProperty('--accent-2', `color-mix(in srgb, ${accent} 60%, white)`);
    root.setProperty('--on-accent', luminance(accent) > 0.45 ? '#0b0b0b' : '#ffffff');
  }
  document.documentElement.dataset.theme = t.id;
  themeState.applied = t.id;
  return t;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

const themeState = { applied: null, zone: null, timer: null };

/** Which kind of space a location is in, from SDE security and wormhole class. */
function spaceZone(loc) {
  if (!loc || loc.security === null || loc.security === undefined) return null;
  if (loc.region === 'Pochven') return 'pochven';
  const c = Number(loc.whClass) || 0;
  if ((c >= 1 && c <= 6) || (c >= 12 && c <= 18)) return 'wh';
  const s = Math.round(loc.security * 10) / 10;
  return s >= 0.5 ? 'hs' : s > 0 ? 'ls' : 'ns';
}

/** Applies the saved theme, or the location-matched one when that mode is on. */
async function refreshTheme(settings) {
  const s = settings || state.settings || {};
  const auto = s.themeAuto || {};
  clearTimeout(themeState.timer);
  if (!auto.enabled) { themeState.zone = null; applyTheme(s.theme, s.themeAccent); return; }
  let zone = null;
  try {
    const r = await api.nav.pilotLocations();
    if (r.ok && r.data.length) {
      const pick = (state.view === 'char' && r.data.find(p => p.id === state.charId)) || r.data[0];
      zone = spaceZone(pick);
      themeState.where = pick.system ? `${pick.name} in ${pick.system}` : pick.name;
    }
  } catch { /* offline: keep current */ }
  themeState.zone = zone;
  applyTheme(zone ? (auto[zone] || LOCATION_DEFAULTS[zone]) : s.theme, s.themeAccent);
  themeState.timer = setTimeout(() => refreshTheme(), 120000);
}

function themePreview(t) {
  const c = t.c;
  return raw(`<div class="tp" style="background:${c.bg}">
    <div class="ts" style="background:${c['bg-2']};border-right:1px solid ${c.line}"><i style="background:${c.accent}"></i><i style="background:${c.muted}"></i><i style="background:${c.dim}"></i><i style="background:${c.dim}"></i></div>
    <div class="tm"><div class="tpanel" style="background:${c.panel};border:1px solid ${c.line}"><i style="background:${c.text};width:60%"></i><i style="background:${c.muted};width:85%"></i>
      <div style="display:flex;gap:4px;margin-top:auto"><i style="background:${c.accent};width:34%"></i><i style="background:${c.green};width:14%"></i><i style="background:${c.red};width:14%"></i><i style="background:${c.gold};width:14%"></i></div></div></div></div>`);
}

function themeCard(t, on) {
  return html`<button class="theme-card ${on ? 'on' : ''}" data-theme="${t.id}">${themePreview(t)}
    <div class="tinfo"><div class="tname">${t.name}${on ? raw('<span class="badge accent">Active</span>') : ''}</div><div class="tblurb">${t.blurb}</div>
    <div class="theme-tags">${t.tags.map(x => html`<span>${x}</span>`)}</div></div></button>`;
}
