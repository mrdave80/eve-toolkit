/* Daily rewards: Daily Goals ticks per pilot, monthly track, EVE news (login campaigns, SP events) and server status. */
const dailyState = { timer: null };
const NEWS_KIND_LABELS = { login: 'Login rewards', sp: 'Skill points', free: 'Free', sale: 'Sale or offer', event: 'Event' };

async function renderDaily(stillCurrent) {
  setContent(loadingView('Loading daily rewards…'));
  const r = await api.daily.status();
  if (stillCurrent && !stillCurrent()) return;
  if (!r.ok) return setContent(errorView(r));
  drawDaily(r.data);
  clearInterval(dailyState.timer);
  dailyState.timer = setInterval(() => { if (state.view !== 'daily') return clearInterval(dailyState.timer); const el = $('#dl-reset'); if (el) el.textContent = fmtDuration(Number(el.dataset.at) - Date.now(), true); }, 30000);
}

function drawDaily(d) {
  const c = d.cfg;
  const tracked = d.pilots.filter(p => p.track);
  const doneN = tracked.filter(p => p.doneToday).length;
  const active = d.news.filter(n => n.active && n.kinds.length);
  const login = active.filter(n => n.kinds.includes('login'));
  const tq = d.tq || {};
  const tqText = tq.online === true ? `Online · ${fmtNum(tq.players)} pilots` : tq.online === false ? 'Offline' : 'Checking…';

  setContent(html`<div class="grid grid-4" style="margin-bottom:16px">
      ${stat('Next reset', html`<span id="dl-reset" data-at="${d.nextReset}">${fmtDuration(d.nextReset - Date.now(), true)}</span>`, '11:00 EVE time · ' + new Date(d.nextReset).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) + ' your time')}
      ${stat('Daily goals ticked', `${doneN} / ${tracked.length}`, 'Pilots you track', doneN === tracked.length && tracked.length ? 'pos' : '')}
      ${stat('Login campaign', login.length ? 'On now' : 'None seen', login.length ? (login[0].endsAt ? 'Until ' + fmtDate(login[0].endsAt) : login[0].title) : 'From EVE news', login.length ? 'pos' : '')}
      ${stat('Tranquility', tqText, tq.since ? 'Since ' + fmtDate(tq.since) : '', tq.online === false ? 'neg' : '')}
    </div>

    ${login.length ? html`<div class="notice" style="margin-bottom:14px"><b>Login rewards are running:</b> ${login.map(n => html`<a href="#" data-ext="${n.link}">${n.title}</a>${n.endsAt ? ` (until ${fmtDate(n.endsAt)})` : ''}`)}. Log in each account once per day after downtime and claim them on the character selection screen.</div>` : ''}

    <div class="grid grid-2" style="align-items:start">
      <div class="panel" style="padding:0">
        <div style="padding:14px 18px 6px;display:flex;align-items:center;gap:10px"><h3 style="margin:0;flex:1">Daily goals and monthly track</h3>
          <button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" id="dl-all">Tick all</button><button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" id="dl-none">Clear today</button></div>
        <div class="dim" style="padding:0 18px 10px;font-size:12px">EVE doesn't share Daily Goals through ESI, so tick a pilot once you've claimed the 10,000 SP for two goals. Each tick is one step on the ${d.monthSteps}-step monthly track. ${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left this month, counting today.</div>
        ${d.pilots.length ? html`<table><thead><tr><th>Pilot</th><th>Today</th><th>Monthly track</th><th class="right">Track</th></tr></thead><tbody>
          ${d.pilots.map(p => html`<tr style="${raw(p.track ? '' : 'opacity:.5')}">
            <td><img src="${portrait(p.id, 32)}" width="22" height="22" style="border-radius:4px;vertical-align:middle;margin-right:8px">${p.name}</td>
            <td><label class="check" style="margin:0"><input type="checkbox" data-dl-done="${p.id}" ${raw(p.doneToday ? 'checked' : '')} ${raw(p.track ? '' : 'disabled')}> ${p.doneToday ? 'Done' : 'Not yet'}</label></td>
            <td><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1;min-width:80px;margin-top:0"><i style="width:${Math.round(p.steps / d.monthSteps * 100)}%"></i></div>
              <span class="num" style="font-size:12px">${p.steps}/${d.monthSteps}</span>
              ${p.track && p.stepsLeft > 0 && p.impossible ? html`<span class="badge red" title="Not enough days left this month">can't finish</span>` : p.track && p.atRisk ? html`<span class="badge gold" title="Few spare days left">tight</span>` : p.stepsLeft === 0 ? html`<span class="badge green">complete</span>` : ''}</div></td>
            <td class="right"><input type="checkbox" title="Track this pilot" data-dl-track="${p.id}" ${raw(p.track ? 'checked' : '')}></td></tr>`)}
        </tbody></table>` : emptyBox('Add a pilot to start tracking.')}
      </div>

      <div class="panel" style="padding:0">
        <div style="padding:14px 18px 6px;display:flex;align-items:center;gap:10px"><h3 style="margin:0;flex:1">EVE news</h3>
          <span class="dim" style="font-size:12px">${d.newsAt ? 'Checked ' + fmtDate(d.newsAt) : 'Not checked yet'}</span><button class="btn btn-ghost" style="padding:3px 10px;font-size:12px" id="dl-news">⟳ Check now</button></div>
        ${d.news.length ? html`<table><tbody>${d.news.slice(0, 15).map(n => html`<tr style="${raw(n.active ? '' : 'opacity:.6')}"><td>
            <div><a href="#" data-ext="${n.link}">${n.title}</a></div>
            <div style="margin-top:3px">${n.kinds.map(k => html`<span class="badge ${k === 'login' || k === 'sp' ? 'green' : k === 'free' ? 'accent' : ''}" style="margin-right:4px">${NEWS_KIND_LABELS[k]}</span>`)}
              <span class="dim" style="font-size:11.5px">${fmtDay(n.pub)}${n.endsAt ? ' · until ' + fmtDate(n.endsAt) : ''}</span></div></td></tr>`)}</tbody></table>`
          : html`<div class="empty" style="padding:24px">Click <b>Check now</b> to read the latest EVE news.</div>`}
      </div>
    </div>

    <div class="panel" style="margin-top:16px"><h3>Alerts</h3>
      <div class="grid grid-2">
        <div>
          <label class="check"><input type="checkbox" id="dl-tq" ${raw(c.tqUp ? 'checked' : '')}> Tranquility is back up after downtime</label>
          <label class="check"><input type="checkbox" id="dl-long" ${raw(c.longDowntime ? 'checked' : '')}> Downtime is running long</label>
          <label class="check"><input type="checkbox" id="dl-reset-a" ${raw(c.resetAlert ? 'checked' : '')}> Daily reset (if the server-up alert didn't fire)</label>
          <label class="check"><input type="checkbox" id="dl-rem" ${raw(c.reminder ? 'checked' : '')}> Remind me about unticked pilots
            <input type="number" id="dl-hrs" min="0.5" max="12" step="0.5" value="${c.reminderHours}" style="width:64px;margin:0 6px;background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);border-radius:6px;padding:3px 6px;font:inherit;color-scheme:dark"> hours before reset</label>
          <label class="check"><input type="checkbox" id="dl-month" ${raw(c.monthly ? 'checked' : '')}> Warn when a pilot's monthly track is at risk</label>
        </div>
        <div>
          <label class="check"><input type="checkbox" id="dl-newson" ${raw(c.news ? 'checked' : '')}> Alert on new EVE news about:</label>
          <div style="padding-left:24px">${Object.entries(NEWS_KIND_LABELS).map(([k, l]) => html`<label class="check" style="display:inline-flex;margin:0 14px 6px 0"><input type="checkbox" data-dl-kind="${k}" ${raw(c.newsKinds[k] ? 'checked' : '')}> ${l}</label>`)}</div>
          <div class="dim" style="font-size:12px;margin-top:6px">Alerts use your Windows notification settings. To get them on your phone, turn on "Daily reset, login rewards…" in Settings → Phone alerts.</div>
        </div>
      </div>
      <button class="btn btn-primary" id="dl-save" style="margin-top:10px">Save alerts</button>
    </div>`);

  document.querySelectorAll('[data-ext]').forEach(a => a.onclick = e => { e.preventDefault(); api.openLink(a.dataset.ext); });
  const reload = async () => { const r = await api.daily.status(); if (r.ok) drawDaily(r.data); };
  document.querySelectorAll('[data-dl-done]').forEach(x => x.onchange = async () => { await api.daily.done(Number(x.dataset.dlDone), x.checked); reload(); });
  document.querySelectorAll('[data-dl-track]').forEach(x => x.onchange = async () => { await api.daily.track(Number(x.dataset.dlTrack), x.checked); reload(); });
  $('#dl-all').onclick = async () => { await api.daily.allDone(true); reload(); };
  $('#dl-none').onclick = async () => { await api.daily.allDone(false); reload(); };
  $('#dl-news').onclick = async () => { const b = $('#dl-news'); b.disabled = true; b.textContent = 'Checking…'; const r = await api.daily.news(); if (!r.ok) { toast(r.error || 'Could not read EVE news', true); b.disabled = false; b.textContent = '⟳ Check now'; return; } drawDaily(r.data); };
  $('#dl-save').onclick = async () => {
    const r = await api.daily.save({ tqUp: $('#dl-tq').checked, longDowntime: $('#dl-long').checked, resetAlert: $('#dl-reset-a').checked, reminder: $('#dl-rem').checked,
      reminderHours: Number($('#dl-hrs').value), monthly: $('#dl-month').checked, news: $('#dl-newson').checked,
      newsKinds: Object.fromEntries([...document.querySelectorAll('[data-dl-kind]')].map(x => [x.dataset.dlKind, x.checked])) });
    toast(r.ok ? 'Saved' : (r.error || 'Could not save'), !r.ok);
  };
}
