'use strict';
/* "What do you play": pick your activities on first run and the app shows only the tools and sidebar
   pages for them. Everything stays reachable through search (Ctrl+K) and can be shown again in Settings.
   Also: UI zoom with Ctrl + / Ctrl − / Ctrl 0 (and Ctrl + mouse wheel), remembered between runs. */

const PLAYSTYLES = [
  ['mining', 'Mining and ice', 'Belts, ice, moon mining and mining tax', ['t-mining', 't-belt', 't-mineral', 't-ores', 't-reprocess', 't-moon', 't-haul'], ['industryAll']],
  ['industry', 'Industry and building', 'Manufacturing, invention, blueprints', ['t-build', 't-wtb', 't-split', 't-bpc', 't-invent', 't-where', 't-reprocess', 't-haul'], ['industryAll']],
  ['trading', 'Trading and hauling', 'Orders, station trading, hauling, contracts', ['t-orders', 't-arbitrage', 't-trade', 't-station', 't-bargain', 't-lp', 't-courier', 't-haul'], []],
  ['pi', 'Planetary industry', 'Colonies, extractors and PI chains', [], ['planetsAll', 'piPlanner']],
  ['pve', 'Ratting, missions and Abyss', 'Bounties, agents, Abyssal runs', ['t-pve', 't-hunt', 't-agents', 't-lp', 't-insure', 't-intel', 't-local', 't-explore', 't-sitecheck'], ['liveMap']],
  ['explore', 'Exploration', 'Relic and data sites, scanning', ['t-explore', 't-sitecheck', 't-local', 't-intel', 't-whres'], ['wormholes', 'liveMap']],
  ['wormholes', 'Wormhole life', 'Chains, rolling, residents', ['t-whres', 't-local', 't-intel', 't-combat', 't-explore', 't-sitecheck', 't-mining'], ['wormholes']],
  ['pvp', 'PvP and hunting', 'Intel, Local, d-scan, wars, fits', ['t-hunt', 't-intel', 't-local', 't-combat', 't-shame', 't-wars', 't-muta', 't-jump', 't-universe', 't-whres'], ['liveMap']],
  ['corp', 'Running a corp or fleets', 'Directors, FCs, structures, doctrines', ['t-wars', 't-jump'], ['corp']],
  ['alts', 'Alts and skill farms', 'Injectors, character value', ['t-farm', 't-charval'], []]
];
// Always shown, whatever you play
const CORE_TOOLS = ['t-market', 't-appraisal', 't-items', 't-prices', 't-assets', 't-route', 't-pilot', 't-sysintel', 't-fit', 't-fitlib', 't-train', 't-skillbuy', 't-compare', 't-eveset', 't-networth', 't-income'];
const CORE_VIEWS = ['dashboard', 'trainingAll', 'mailAll', 'contractsAll', 'notesAll', 'tools', 'daily', 'settings', 'help', 'about'];

function playstyle() { try { return JSON.parse(localStorage.getItem('playstyle') || 'null'); } catch { return null; } }
function setPlaystyle(p) { try { localStorage.setItem('playstyle', JSON.stringify(p)); } catch {} applyPlaystyle(); }
function visibleTools() {
  const p = playstyle(); if (!p || p.all || !p.styles || !p.styles.length) return null;   // null = everything
  const s = new Set(CORE_TOOLS); for (const [k, , , tools] of PLAYSTYLES) if (p.styles.includes(k)) tools.forEach(t => s.add(t));
  return s;
}
function visibleViews() {
  const p = playstyle(); if (!p || p.all || !p.styles || !p.styles.length) return null;
  const s = new Set(CORE_VIEWS); for (const [k, , , , views] of PLAYSTYLES) if (p.styles.includes(k)) views.forEach(v => s.add(v));
  return s;
}
const toolShown = k => { const v = visibleTools(); return !v || v.has(k); };
/** TOOLS_GROUPS with hidden tools taken out (empty groups dropped). The current tool always shows. */
function shownToolGroups(cur) {
  const v = visibleTools(); if (!v) return TOOLS_GROUPS;
  return TOOLS_GROUPS.map(([g, items]) => [g, items.filter(([k]) => v.has(k) || k === cur)]).filter(([, items]) => items.length);
}
function applyPlaystyle() {
  const v = visibleViews();
  document.querySelectorAll('.side-link[data-view]').forEach(b => { b.hidden = !!v && !v.has(b.dataset.view); });
  if (typeof renderTopbar === 'function' && typeof state !== 'undefined' && state.view) renderTopbar();
}

function openPlaystyle(first = false) {
  const p = playstyle() || { styles: [] };
  openModal(first ? 'What do you play?' : 'What you play', html`<div class="muted" style="font-size:13px;margin-bottom:12px">${first ? 'EVE Toolkit has well over a hundred tools. Tick what you do in EVE and only those show up; ' : 'Tick what you do in EVE; '}the rest stay one search away (Ctrl+K). You can change this any time in Settings.</div>
    <div class="ps-grid">${PLAYSTYLES.map(([k, l, d]) => html`<label class="ps-card"><input type="checkbox" data-ps="${k}" ${raw(p.styles.includes(k) ? 'checked' : '')}><span><b>${l}</b><span class="dim">${d}</span></span></label>`)}</div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="ps-all" ${raw(p.all ? 'checked' : '')}> Show every tool anyway</label>`,
    { submit: 'Done', wide: true, onSubmit: () => {
      const styles = [...document.querySelectorAll('[data-ps]')].filter(c => c.checked).map(c => c.dataset.ps);
      setPlaystyle({ styles, all: $('#ps-all').checked, done: true });
      toast(styles.length && !$('#ps-all').checked ? 'Tools set for how you play' : 'Showing every tool');
    } });
}
/** First run: ask once, after pilots and settings are loaded. */
function maybeAskPlaystyle() {
  const p = playstyle();
  if (p && p.done) return;
  if (typeof state === 'undefined' || !state.settings || !state.settings.clientId) return;   // still setting the app up
  // Ask once: closing it without choosing shows every tool, and it doesn't come back (Settings has it).
  setTimeout(() => { if (document.getElementById('modal')) return; try { localStorage.setItem('playstyle', JSON.stringify({ styles: [], done: true })); } catch {} openPlaystyle(true); }, 1200);
}

// ---------- Zoom ----------
let zoomLevel = 1;
function setZoom(z, quiet) {
  zoomLevel = Math.max(0.6, Math.min(1.8, Math.round(z * 20) / 20));
  if (window.api && api.zoom) api.zoom(zoomLevel);
  try { localStorage.setItem('uiZoom', String(zoomLevel)); } catch {}
  if (!quiet) toast(`Zoom ${Math.round(zoomLevel * 100)}%`);
}
try { const z = Number(localStorage.getItem('uiZoom')); if (z > 0) setZoom(z, true); } catch {}
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoomLevel + 0.1); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(zoomLevel - 0.1); }
  else if (e.key === '0') { e.preventDefault(); setZoom(1); }
});
document.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); setZoom(zoomLevel + (e.deltaY < 0 ? 0.1 : -0.1)); } }, { passive: false });
