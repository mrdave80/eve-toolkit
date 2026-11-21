'use strict';
/* Which pilots raise alerts. Each pilot is set to
   - 'all'    every alert (the default)
   - 'online' only while that pilot is logged in to EVE (checked with CCP, cached for two minutes)
   - 'off'    no pop-ups, phone or spoken alerts; still kept in the alerts inbox, marked as muted,
              and left out of daily goal reminders and Needs attention.
   Pilots muted with the older tick-boxes count as 'off'. */
const store = require('./store');

const MODES = ['all', 'online', 'off'];
function mode(id) {
  const st = store.get().settings || {};
  const m = (st.pilotAlerts || {})[Number(id)];
  if (MODES.includes(m)) return m;
  return (st.mutedPilots || []).map(Number).includes(Number(id)) ? 'off' : 'all';
}
const quiet = id => mode(id) === 'off';

/** The pilot an alert is about: an id, a name, or the first pilot named at the start of the title. */
function idFor(pilot, title, body) {
  const chars = store.get().characters || [];
  if (typeof pilot === 'number' || (typeof pilot === 'string' && /^\d+$/.test(pilot))) return Number(pilot);
  if (typeof pilot === 'string' && pilot) { const c = chars.find(x => x.name.toLowerCase() === pilot.toLowerCase()); if (c) return c.id; }
  if (pilot === null || pilot === undefined) {
    const t = String(title || ''), b = String(body || '');
    // longest name first so "Mike Hunt II" isn't matched as "Mike Hunt"
    for (const c of [...chars].sort((a, z) => z.name.length - a.name.length)) {
      const n = c.name;
      if (t === n || t.startsWith(n + ' ') || t.startsWith(n + ':') || t.startsWith(n + "'") || b.startsWith(n + ':')) return c.id;
    }
  }
  return null;
}

const onlineCache = new Map();
/** true / false, or null when we can't tell (no permission, CCP not answering). */
async function isOnline(id) {
  const hit = onlineCache.get(id);
  if (hit && Date.now() - hit.at < 2 * 60000) return hit.on;
  const c = (store.get().characters || []).find(x => x.id === Number(id));
  if (!c || c.needsReauth || !(c.scopes || []).includes('esi-location.read_online.v1')) return null;
  let on = null;
  try { const r = await require('./esi').get(`/characters/${c.id}/online/`, c.id); on = !!(r && r.online); } catch { on = null; }
  onlineCache.set(id, { at: Date.now(), on });
  return on;
}

/** Should an alert about this pilot pop up now? Returns { show, reason } where reason explains a skip. */
async function check(id) {
  if (!id) return { show: true };
  const m = mode(id);
  if (m === 'off') return { show: false, reason: 'muted' };
  if (m === 'online') { const on = await isOnline(id); if (on === false) return { show: false, reason: 'offline' }; }
  return { show: true };
}

function set(id, m) {
  if (!MODES.includes(m)) throw new Error('Unknown alert setting.');
  const d = store.get();
  d.settings.pilotAlerts = { ...(d.settings.pilotAlerts || {}), [Number(id)]: m };
  d.settings.mutedPilots = (d.settings.mutedPilots || []).filter(x => Number(x) !== Number(id));
  store.save('settings');
  return d.settings.pilotAlerts;
}
function all() {
  return (store.get().characters || []).map(c => ({ id: c.id, name: c.name, mode: mode(c.id), canCheckOnline: !c.needsReauth && (c.scopes || []).includes('esi-location.read_online.v1') }));
}

module.exports = { mode, quiet, idFor, isOnline, check, set, all, MODES, _clear: () => onlineCache.clear() };
