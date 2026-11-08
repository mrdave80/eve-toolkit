'use strict';
/* Spoken alerts through Windows' built-in voices (Web Speech API). */

const SPEECH_DEFAULTS = { enabled: false, voice: '', rate: 1.1, volume: 1, intel: true, local: true, spike: true, abyss: false, route: true };
const speechCfg = () => ({ ...SPEECH_DEFAULTS, ...((state.settings || {}).speech || {}) });
let lastSaid = { text: '', at: 0 };

function say(text, kind, force) {
  const c = speechCfg();
  if (!force && (!c.enabled || (kind && c[kind] === false))) return;
  if (!('speechSynthesis' in window)) return;
  if (text === lastSaid.text && Date.now() - lastSaid.at < 20000) return; // don't repeat the same line within 20 s
  lastSaid = { text, at: Date.now() };
  const u = new SpeechSynthesisUtterance(text);
  const v = speechSynthesis.getVoices().find(x => x.name === c.voice);
  if (v) u.voice = v;
  u.rate = c.rate; u.volume = c.volume;
  if (speechSynthesis.speaking && speechSynthesis.pending) speechSynthesis.cancel(); // keep the queue short
  speechSynthesis.speak(u);
}

// Spell out names with digits so the voice reads them: J123450 → "J 1 2 3 4 5 0", 1DQ1-A → "1 D Q 1 A"
const sayable = n => /\d/.test(n) ? String(n).replace(/-/g, '').split('').join(' ') : String(n);

api.intel.onReport(r => {
  if (!r.alert || !r.closest) return;
  const j = r.closest.near.jumps;
  const t = r.top && ['High', 'Extreme'].includes(r.top.level) ? `. ${r.top.level} threat ${r.top.name}` : '';
  say(`Hostile, ${j === 0 ? 'in system' : j + (j === 1 ? ' jump' : ' jumps')}, ${sayable(r.closest.name)}${t}`, 'intel');
});
api.intel.onLocal(ev => { if (ev.alert) say(`${ev.level} threat in local. ${ev.pilot.name}${ev.pilot.flags && ev.pilot.flags[0] ? ', ' + ev.pilot.flags[0].label : ''}`, 'local'); });
api.intel.onSpike(s => say(`${s.zone === 'hs' ? 'Possible gank fleet' : 'Kill spike'} in ${sayable(s.system)}, ${s.near.jumps} ${s.near.jumps === 1 ? 'jump' : 'jumps'} from ${s.near.pilot}`, 'spike'));
api.pve.onAbyss((kind, run) => { if (kind === 'end') say(run.died ? `${run.charName} lost the ship in the abyss` : `Abyss run finished in ${run.minutes} minutes`, 'abyss'); });

function drawSpeechPanel() {
  const box = $('#speech-panel'); if (!box) return;
  const c = speechCfg();
  const voices = ('speechSynthesis' in window) ? speechSynthesis.getVoices() : [];
  box.innerHTML = String(html`<h3>Spoken alerts</h3>
    <div class="muted" style="margin-bottom:10px">Hear alerts while you're focused on the game, for example "Hostile, 2 jumps, Tama. Extreme threat Ben Dover". Uses the voices installed in Windows.</div>
    <label class="check"><input type="checkbox" id="sp-on" ${raw(c.enabled ? 'checked' : '')}> <b>Speak alerts</b></label>
    <div class="grid grid-3" style="gap:10px;margin-top:8px">
      ${field('Voice', html`<select id="sp-voice" class="crumb-select"><option value="">Windows default</option>${voices.filter(v => /^en/i.test(v.lang) || v.name === c.voice).map(v => html`<option value="${v.name}" ${raw(v.name === c.voice ? 'selected' : '')}>${v.name}</option>`)}</select>`)}
      ${field('Speed', html`<input type="range" id="sp-rate" min="0.6" max="1.8" step="0.1" value="${c.rate}">`)}
      ${field('Volume', html`<input type="range" id="sp-vol" min="0.1" max="1" step="0.1" value="${c.volume}">`)}</div>
    <div class="pi-chips">${[['intel', 'Intel reports near my pilots'], ['local', 'Threats in Local'], ['spike', 'Kill spikes'], ['abyss', 'Abyss run finished']].map(([k, l]) => html`<label class="check" style="margin:0 14px 6px 0"><input type="checkbox" data-sp="${k}" ${raw(c[k] !== false ? 'checked' : '')}> ${l}</label>`)}</div>
    <div class="toolbar" style="margin-top:8px"><button class="btn btn-primary" id="sp-save">Save spoken alerts</button><button class="btn btn-ghost" id="sp-test">▶ Test voice</button></div>`);
  const read = () => ({ enabled: $('#sp-on').checked, voice: $('#sp-voice').value, rate: Number($('#sp-rate').value), volume: Number($('#sp-vol').value), ...Object.fromEntries([...document.querySelectorAll('[data-sp]')].map(x => [x.dataset.sp, x.checked])) });
  $('#sp-test').onclick = () => { const prev = state.settings.speech; state.settings.speech = read(); lastSaid = { text: '', at: 0 }; say('Hostile, 2 jumps, Tama. Extreme threat Ben Dover', null, true); state.settings.speech = prev; };
  $('#sp-save').onclick = async () => { const r = await api.setSettings({ speech: read() }); if (!r.ok) return toast(r.error, true); state.settings = r.data; toast('Spoken alerts saved'); };
  if (!voices.length && 'speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => drawSpeechPanel();
}
