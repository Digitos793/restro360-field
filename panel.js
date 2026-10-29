'use strict';
/* Restro360 Field — web panel for Manager / CEO / Admin. Uses helpers from app.js.
 * Managers only ever receive their own team's data; the Apps Script backend enforces it. */

const STAGES = ['New', 'Visited', 'Interested', 'Demo', 'Closed', 'Lost'];
const STAGE_CHIP = { Interested: 'ok', Demo: 'info', Closed: 'ok', Lost: 'bad', Merged: '' };
const MATCH_LABEL = { PHONE: 'Same phone number', EMAIL: 'Same email', NAME_NEARBY: 'Same name nearby' };

async function getTeam() {
  if (!S.team) S.team = (await api('team')).reps;
  return S.team;
}

function repSelect(id, reps, value, allLabel) {
  return `<select id="${id}"><option value="">${esc(allLabel || 'Select rep…')}</option>${reps.map(r =>
    `<option value="${esc(r.id)}" ${r.id === value ? 'selected' : ''}>${esc(r.name)}${r.manager && !isManager() ? ' (' + esc(r.manager) + ')' : ''}</option>`).join('')}</select>`;
}

function isManager() { return S.user && S.user.role === 'MANAGER'; }
function tile(v, label) { return `<div class="tile"><div class="v">${esc(v)}</div><div class="l">${esc(label)}</div></div>`; }
function stageChip(s) { return `<span class="chip ${STAGE_CHIP[s] || ''}">${esc(s || 'New')}</span>`; }
function outcomeChip(o) { return o ? `<span class="chip" style="background:${OUTCOME_COLOR[o]}1a;color:${OUTCOME_COLOR[o]}">${esc(OUTCOME_LABEL[o] || o)}</span>` : ''; }
function flagChips(f) { return String(f || '').split(',').map(x => x.trim()).filter(Boolean).map(x => `<span class="chip bad">${esc(x.replace(/_/g, ' ').toLowerCase())}</span>`).join(' '); }

function minutesAgo(s) {
  if (!s) return Infinity;
  const t = new Date(String(s).replace(' ', 'T')).getTime();
  return isNaN(t) ? Infinity : (Date.now() - t) / 60000;
}

// ======================= DASHBOARD =======================

view('dash', async el => {
  el.innerHTML = `<div class="toolbar"><h2>Dashboard</h2><input type="date" id="d" value="${todayStr()}"><button class="btn small" id="r">Refresh</button></div>
    <div id="b"><p class="muted">Loading…</p></div>`;
  const load = async () => {
    let out;
    try {
      out = await api('dashboard', { date: $('#d', el).value });
    } catch (e) {
      if (el.isConnected) $('#b', el).innerHTML = `<div class="card error">${esc(e.message)}</div>`;
      return;
    }
    if (!el.isConnected) return;
    S.maps.forEach(m => m.remove());
    S.maps = [];
    const k = out.kpis;
    $('#b', el).innerHTML = `
      <div class="tiles">
        ${tile(k.visits, 'Visits')}${tile(k.interested, 'Interested')}${tile(k.demos, 'Demos booked')}${tile(k.conversion + '%', 'Conversion')}
        ${tile(k.avgMin + ' min', 'Avg time per visit')}${tile(k.followUpsDue, 'Follow-ups due')}${tile(k.activeReps + ' / ' + k.totalReps, 'Reps in field')}${tile(k.flagged, 'Flagged visits')}
      </div>
      <div class="cols wide-left">
        <div><div id="map" class="map tall"></div>
          <p class="muted small">Orange pin = rep's last known location (updates while their app is open). Dots = visits, coloured by outcome.</p></div>
        <div class="card"><h3>Reps</h3>
          ${out.reps.length ? `<div class="scroll-x"><table class="tbl"><tr><th>Rep</th><th>Day</th><th class="n">Visits</th><th>Last seen</th></tr>
          ${out.reps.map(r => `<tr class="click" data-rep="${esc(r.id)}"><td>${esc(r.name)}</td>
            <td>${r.ended ? `<span class="chip">Ended ${esc(r.ended.slice(11, 16))}</span>` : r.started ? `<span class="chip ok">In field ${esc(r.started.slice(11, 16))}</span>` : '<span class="chip warn">Not started</span>'}</td>
            <td class="n">${r.visits}</td><td class="small muted">${esc(String(r.lastSeen || '').slice(5, 16))}</td></tr>`).join('')}</table></div>`
            : '<p class="muted small">No reps yet. Add reps in the Users sheet with your phone in the managerPhone column.</p>'}
        </div>
      </div>
      <div class="card"><h3>Visits</h3>
        ${out.visits.length ? `<div class="scroll-x"><table class="tbl"><tr><th>Time</th><th>Rep</th><th>Restaurant</th><th>Outcome</th><th class="n">Score</th><th>Flags</th></tr>
        ${out.visits.map(v => `<tr class="click" data-lead="${esc(v.locationId)}"><td>${esc(v.time)}</td><td>${esc(v.rep)}</td><td>${esc(v.place)}</td><td>${outcomeChip(v.outcome)}</td><td class="n">${esc(v.score)}</td><td>${flagChips(v.flags)}</td></tr>`).join('')}
        </table></div>` : '<p class="muted small">No visits for this date.</p>'}
      </div>`;
    const map = makeMap($('#map', el));
    if (map) {
      const pts = [];
      out.reps.forEach(r => {
        if (!Number(r.lastLat)) return;
        const live = r.started && !r.ended && minutesAgo(r.lastSeen) < 30;
        const initials = String(r.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        L.marker([r.lastLat, r.lastLng], { icon: numIcon(initials, live ? '#ea580c' : '#a8a29e') }).addTo(map)
          .bindPopup(`<b>${esc(r.name)}</b><br>Last seen ${esc(r.lastSeen || '-')}`);
        pts.push([r.lastLat, r.lastLng]);
      });
      out.visits.forEach(v => {
        if (!Number(v.lat)) return;
        L.circleMarker([v.lat, v.lng], { radius: 7, color: '#fff', weight: 2, fillColor: OUTCOME_COLOR[v.outcome] || '#78716c', fillOpacity: 1 }).addTo(map)
          .bindPopup(`<b>${esc(v.place)}</b><br>${esc(v.rep)} · ${esc(v.time)}<br>${esc(OUTCOME_LABEL[v.outcome] || '')}`);
        pts.push([v.lat, v.lng]);
      });
      fitTo(map, pts);
    }
    $$('[data-rep]', el).forEach(tr => { tr.onclick = () => go('replay', { rep: tr.dataset.rep, date: $('#d', el).value }); });
    $$('[data-lead]', el).forEach(tr => { tr.onclick = () => go('lead', { id: tr.dataset.lead }); });
  };
  $('#r', el).onclick = load;
  $('#d', el).onchange = load;
  await load();
  if (el.isConnected) S.timers.push(setInterval(load, 120000));
}, { panel: true });

// ======================= LEADS =======================

view('leads', async (el, p) => {
  const reps = await getTeam();
  el.innerHTML = `<div class="toolbar"><h2>Leads</h2>
      <input id="q" placeholder="Search name, area, phone" value="${esc(p.get('q') || '')}">
      <select id="stage"><option value="">All stages</option>${STAGES.map(s => `<option ${p.get('stage') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      ${repSelect('rep', reps, p.get('rep') || '', 'All reps')}
      <button class="btn small primary" id="go">Search</button></div>
    <div id="b" class="card"><p class="muted">Loading…</p></div>`;
  const load = async () => {
    const out = await api('leads', { q: $('#q', el).value, stage: $('#stage', el).value, repId: $('#rep', el).value });
    $('#b', el).innerHTML = out.rows.length ? `<p class="muted small">${out.total} lead(s)${out.total > out.rows.length ? ', showing latest ' + out.rows.length : ''}</p>
      <div class="scroll-x"><table class="tbl"><tr><th>Restaurant</th><th>Stage</th><th>Status</th><th>Rep</th><th>Owner</th><th>Last visit</th><th>Follow-up</th></tr>
      ${out.rows.map(l => `<tr class="click" data-id="${esc(l.id)}">
        <td><b>${esc(l.name)}</b><div class="muted small">${esc(l.area || l.address || '')} ${esc(l.pincode || '')}</div>${l.dupNote ? `<span class="chip warn">${esc(l.dupNote)}</span>` : ''}</td>
        <td>${stageChip(l.stage)}</td><td class="small">${esc(l.status)}</td><td class="small">${esc(l.ownerRep || l.assignedRep)}</td>
        <td class="small">${esc(l.ownerName)}<div class="muted">${esc(l.ownerPhone)}</div></td>
        <td class="small">${esc(String(l.lastVisitAt || '').slice(0, 10))}</td><td class="small">${esc(l.nextFollowUp)}</td></tr>`).join('')}
      </table></div>` : '<p class="muted">No leads match.</p>';
    $$('[data-id]', el).forEach(tr => { tr.onclick = () => go('lead', { id: tr.dataset.id }); });
  };
  $('#go', el).onclick = () => load().catch(e => toast(e.message, 'error'));
  $('#q', el).onkeydown = e => { if (e.key === 'Enter') $('#go', el).click(); };
  await load();
}, { panel: true });

view('lead', async (el, p) => {
  const [out, reps] = await Promise.all([api('leadDetail', { id: p.get('id') }), getTeam()]);
  const l = out.lead;
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const contact = (n, ph, wa, em) => [esc(n), telLink(ph), wa && wa !== ph ? 'WA ' + telLink(wa) : '', esc(em)].filter(Boolean).join(' · ');
  el.innerHTML = `
    <div class="toolbar"><a class="btn small" href="#leads">← Leads</a><h2>${esc(l.name)}</h2>${stageChip(l.stage)}</div>
    ${l.dupNote ? `<div class="banner warn">${esc(l.dupNote)}</div>` : ''}
    <div class="cols">
      <div class="card"><h3>Details</h3><dl class="kv">
        ${row('Type', esc(l.type))}${row('Address', esc(l.address))}${row('Area / pincode', esc([l.area, l.pincode].filter(Boolean).join(' · ')))}
        ${row('Outlets / seating', esc([l.outlets, l.seating].filter(Boolean).join(' / ')))}${row('Cuisine', esc(l.cuisine))}
        ${row('Current POS', esc(l.currentPOS) + (l.posExpiry ? ' (expires ' + esc(l.posExpiry) + ')' : ''))}
        ${row('Owner', contact(l.ownerName, l.ownerPhone, l.ownerWhatsapp, l.ownerEmail))}
        ${row('Manager / IT', contact(l.mgrName, l.mgrPhone, l.mgrWhatsapp, l.mgrEmail))}
        ${row('Business card', contact(l.cardName + (l.cardDesignation ? ', ' + l.cardDesignation : ''), l.cardPhone, '', l.cardEmail) + (l.cardUrl ? ` <button class="btn small" data-file="${esc(l.cardUrl)}" data-t="Business card">View card</button>` : ''))}
        ${row('Owner rep', esc(l.ownerRep) + (l.ownedSince ? ' <span class="muted">since ' + esc(l.ownedSince.slice(0, 10)) + '</span>' : ''))}
        ${row('Assigned to', esc(l.assignedRep))}${row('Status', esc(l.status))}${row('Demo', esc(l.demoAt))}
        ${row('Source', esc(l.source))}${row('Created', esc(l.createdAt))}
      </dl></div>
      <div>
        <form id="mf" class="card"><h3>Manage</h3>
          <label>Stage<select name="stage">${STAGES.map(s => `<option ${s === (l.stage || 'New') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label>Reassign to rep (overrides lead protection)${repSelect('repSel', reps, l.ownerRepId || l.assignedRepId, 'Keep current')}</label>
          ${inp('nextFollowUp', 'Next follow-up', 'date', `value="${esc(l.nextFollowUp)}"`)}
          <button class="btn primary">Save</button>
        </form>
        <div id="map" class="map"></div>
      </div>
    </div>
    <div class="card"><h3>Visit timeline (${out.visits.length})</h3>
      ${out.visits.length ? out.visits.map(v => `
        <div class="item"><div class="body">
          <div class="spread"><b>${esc(v.checkInAt.slice(0, 16))}</b>${outcomeChip(v.outcome)}</div>
          <div class="muted small">${esc(v.rep)} · ${esc(v.durationMin)} min · score ${esc(v.qualityScore)}/100${v.distanceM ? ' · ' + fmtDist(Number(v.distanceM)) + ' from pin' : ''}</div>
          ${v.flags ? `<div style="margin-top:4px">${flagChips(v.flags)}</div>` : ''}
          ${v.modules ? `<div class="small">Modules: ${esc(v.modules)}</div>` : ''}
          ${v.demoAt ? `<div class="small">Demo: ${esc(v.demoAt)}</div>` : ''}${v.followUpAt ? `<div class="small">Follow-up: ${esc(v.followUpAt)}</div>` : ''}
          ${v.notInterestedReason ? `<div class="small">Reason: ${esc(v.notInterestedReason)}</div>` : ''}
          ${v.remarks ? `<p class="small" style="margin-top:6px;white-space:pre-wrap">${esc(v.remarks)}</p>` : ''}
          <div class="acts">${[['photoStorefront', 'Storefront'], ['photoInterior', 'Interior'], ['photoCounter', 'Counter'], ['cardUrl', 'Card'], ['audioUrl', '▶ Voice note']]
            .filter(x => v[x[0]]).map(x => `<button class="btn small" data-file="${esc(v[x[0]])}" data-t="${x[1]}">${x[1]}</button>`).join('')}</div>
        </div></div>`).join('') : '<p class="muted small">No visits yet.</p>'}
    </div>
    ${out.history.length ? `<div class="card"><h3>History</h3><ul class="list">${out.history.map(h => `<li class="item small"><div class="body"><b>${esc(h.action.replace(/_/g, ' ').toLowerCase())}</b> · ${esc(h.user)} · <span class="muted">${esc(h.ts)}</span><div class="muted">${esc(h.detail)}</div></div></li>`).join('')}</ul></div>` : ''}`;
  $$('[data-file]', el).forEach(b => { b.onclick = () => showFile(b.dataset.file, b.dataset.t); });
  const map = makeMap($('#map', el), Number(l.lat) ? [l.lat, l.lng] : null, 16);
  if (map && Number(l.lat)) L.marker([l.lat, l.lng], { icon: numIcon('★', '#ea580c') }).addTo(map);
  $('#mf', el).onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target);
    const repId = $('#repSel', el).value;
    const body = { id: l.id, stage: f.stage, nextFollowUp: f.nextFollowUp };
    if (repId && repId !== l.ownerRepId) body.repId = repId;
    busy(true, 'Saving…');
    try { await api('updateLead', body); toast('Saved', 'ok'); render(); } catch (err) { toast(err.message, 'error'); } finally { busy(false); }
  };
}, { panel: true });

// ======================= ROUTE PLANNER =======================

function nearestOrder(list, start) {
  const rest = list.slice(), out = [];
  let cur = start && Number(start.lat) ? start : rest.find(l => Number(l.lat));
  while (rest.length) {
    let best = 0, bestD = Infinity;
    rest.forEach((l, i) => {
      const d = cur ? distM(cur.lat, cur.lng, l.lat, l.lng) : null;
      const v = d == null ? 1e12 : d;
      if (v < bestD) { bestD = v; best = i; }
    });
    const next = rest.splice(best, 1)[0];
    out.push(next);
    if (Number(next.lat)) cur = next;
  }
  return out;
}

/** Suggested arrival times: start 11:00, ~25 min per visit, 18 km/h city speed, skip the 12:30-3pm lunch rush. */
function schedule(list, start) {
  let t = 11 * 60, prev = start && Number(start.lat) ? start : null;
  return list.map(l => {
    if (prev && Number(l.lat)) t += Math.round(distM(prev.lat, prev.lng, l.lat, l.lng) * 1.4 / 1000 / 18 * 60);
    else if (prev) t += 15;
    if (t >= 750 && t < 900) t = 900;
    const slot = t;
    t += 25;
    if (Number(l.lat)) prev = l;
    return pad(Math.floor(slot / 60)) + ':' + pad(slot % 60);
  });
}

view('planner', async (el, p) => {
  const reps = await getTeam();
  const tomorrow = todayStr(new Date(Date.now() + 864e5));
  el.innerHTML = `<div class="toolbar"><h2>Plan route</h2>${repSelect('rep', reps, p.get('rep') || '')}
      <input type="date" id="date" value="${esc(p.get('date') || tomorrow)}"><button class="btn small primary" id="load">Load</button></div>
    <div id="b"><div class="card muted">Pick a rep and a date, then add locations to build the day's route.</div></div>`;
  let planned = [], cands = [], start = null, filter = '';
  const cap = S.settings.dailyCapacity || 12;

  const load = async q => {
    const repId = $('#rep', el).value;
    if (!repId) return toast('Pick a rep', 'error');
    busy(true, 'Loading…');
    try {
      const out = await api('planGet', { repId, date: $('#date', el).value, q: q || '' });
      planned = out.planned;
      cands = out.candidates;
      start = out.start;
      draw();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy(false);
    }
  };

  const draw = () => {
    S.maps.forEach(m => m.remove());
    S.maps = [];
    const ids = {};
    planned.forEach(l => { ids[l.id] = true; });
    const f = filter.toLowerCase();
    const shown = cands.filter(l => !ids[l.id] && (!f || [l.name, l.area, l.pincode, l.address].join(' ').toLowerCase().includes(f)));
    const times = schedule(planned, start);
    $('#b', el).innerHTML = `
      <div class="cols">
        <div class="card">
          <div class="spread"><h3>Route · ${planned.length} stops</h3>
            <div class="row"><button class="btn small" id="auto">Auto-order (nearest)</button><button class="btn small primary" id="save">Save & publish</button></div></div>
          ${planned.length > cap ? `<div class="banner warn">${planned.length} stops is more than the daily capacity of ${cap}.</div>` : ''}
          <p class="muted small">Drag to reorder (desktop) or use the arrows. Times are suggestions that skip the 12:30–3 pm lunch rush.</p>
          <ul class="list" id="route">${planned.map((l, i) => `
            <li class="item drag" draggable="true" data-i="${i}"><span class="num">${i + 1}</span>
              <div class="body"><div class="spread"><span class="t">${esc(l.name)}</span><span class="chip">${times[i]}</span></div>
                <div class="muted small">${esc(l.area || l.address || '')} ${esc(l.pincode || '')}${Number(l.lat) ? '' : ' · <span style="color:var(--warn)">no map pin</span>'}</div></div>
              <div class="row"><button class="icon-btn" data-up="${i}" aria-label="Up">↑</button><button class="icon-btn" data-down="${i}" aria-label="Down">↓</button><button class="icon-btn" data-rm="${i}" aria-label="Remove">✕</button></div>
            </li>`).join('') || '<p class="muted small">No stops yet - add from the right.</p>'}</ul>
          <div id="map" class="map"></div>
        </div>
        <div class="card"><h3>Add locations</h3>
          <div class="row" style="margin-bottom:10px"><input id="f" placeholder="Filter by name, area, pincode" value="${esc(filter)}" style="flex:1;margin:0">
            <button class="btn small" id="srv">Search all</button></div>
          <div class="spread"><span class="muted small">${shown.length} shown</span>${shown.length ? `<button class="btn small" id="addAll">Add all shown</button>` : ''}</div>
          <ul class="list" id="cands">${shown.slice(0, 200).map(l => `
            <li class="item"><div class="body"><div class="t">${esc(l.name)}</div>
              <div class="muted small">${esc(l.area || l.address || '')} ${esc(l.pincode || '')} · ${esc(l.status || 'Pending')}${l.assignedRep ? ' · ' + esc(l.assignedRep) : ''}</div></div>
              <button class="btn small" data-add="${esc(l.id)}">+ Add</button></li>`).join('')}</ul>
        </div>
      </div>`;

    const map = makeMap($('#map', el));
    if (map) {
      const line = [];
      if (start) { L.circleMarker([start.lat, start.lng], { radius: 8, color: '#1d4ed8', fillOpacity: 0.8 }).addTo(map).bindPopup('Rep last location'); line.push([start.lat, start.lng]); }
      planned.forEach((l, i) => {
        if (!Number(l.lat)) return;
        L.marker([l.lat, l.lng], { icon: numIcon(i + 1, '#ea580c') }).addTo(map).bindPopup(esc(l.name) + ' · ' + times[i]);
        line.push([l.lat, l.lng]);
      });
      if (line.length > 1) L.polyline(line, { color: '#ea580c', weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(map);
      fitTo(map, line);
    }

    const move = (from, to) => {
      if (to < 0 || to >= planned.length) return;
      planned.splice(to, 0, planned.splice(from, 1)[0]);
      draw();
    };
    $$('[data-up]', el).forEach(b => { b.onclick = () => move(+b.dataset.up, +b.dataset.up - 1); });
    $$('[data-down]', el).forEach(b => { b.onclick = () => move(+b.dataset.down, +b.dataset.down + 1); });
    $$('[data-rm]', el).forEach(b => { b.onclick = () => { planned.splice(+b.dataset.rm, 1); draw(); }; });
    $$('[data-add]', el).forEach(b => { b.onclick = () => { planned.push(cands.find(c => c.id === b.dataset.add)); draw(); }; });
    let dragFrom = null;
    $$('#route .drag', el).forEach(li => {
      li.ondragstart = () => { dragFrom = +li.dataset.i; li.classList.add('dragging'); };
      li.ondragend = () => li.classList.remove('dragging');
      li.ondragover = e => e.preventDefault();
      li.ondrop = e => { e.preventDefault(); if (dragFrom !== null) move(dragFrom, +li.dataset.i); dragFrom = null; };
    });
    const addAll = $('#addAll', el);
    if (addAll) addAll.onclick = () => { planned = planned.concat(shown); draw(); };
    $('#f', el).oninput = e => {
      filter = e.target.value;
      clearTimeout(draw.t);
      draw.t = setTimeout(() => { draw(); const i = $('#f', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300);
    };
    $('#srv', el).onclick = () => load(filter);
    $('#auto', el).onclick = () => { planned = nearestOrder(planned, start); draw(); };
    $('#save', el).onclick = async () => {
      busy(true, 'Publishing…');
      try {
        const out = await api('planSave', { repId: $('#rep', el).value, date: $('#date', el).value, ids: planned.map(l => l.id) });
        toast(out.saved + ' stops published to the rep\'s app', 'ok');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        busy(false);
      }
    };
  };

  $('#load', el).onclick = () => load();
  if (p.get('rep')) load();
}, { panel: true });

// ======================= ROUTE REPLAY =======================

view('replay', async (el, p) => {
  const reps = await getTeam();
  el.innerHTML = `<div class="toolbar"><h2>Route replay</h2>${repSelect('rep', reps, p.get('rep') || '')}
      <input type="date" id="date" value="${esc(p.get('date') || todayStr())}"><button class="btn small primary" id="load">Load</button></div>
    <div id="b"><div class="card muted">Pick a rep and a date.</div></div>`;
  const load = async () => {
    const repId = $('#rep', el).value;
    if (!repId) return toast('Pick a rep', 'error');
    busy(true, 'Loading route…');
    let out;
    try { out = await api('replay', { repId, date: $('#date', el).value }); } catch (e) { busy(false); return toast(e.message, 'error'); }
    busy(false);
    S.maps.forEach(m => m.remove());
    S.maps = [];
    const a = out.attendance || {};
    const visitedAt = {};
    out.visits.forEach(v => { if (!visitedAt[v.locationId]) visitedAt[v.locationId] = v; });
    const plannedIds = {};
    out.planned.forEach(x => { plannedIds[x.id] = true; });
    const unplanned = out.visits.filter(v => !plannedIds[v.locationId]);
    $('#b', el).innerHTML = `
      <div class="tiles">${tile(out.km + ' km', 'Distance')}${tile(out.visits.length, 'Visits')}${tile(out.planned.length, 'Planned')}${tile(out.idleMin + ' min', 'Stopped (' + out.stops.length + ' stops)')}</div>
      <p class="muted small">Day: ${esc(String(a.startAt || '-').slice(11, 16))} → ${esc(String(a.endAt || '-').slice(11, 16))} · Blue line = GPS route (recorded while the rep's app was open) · green = visits · grey = planned · orange = stops of 10+ min.</p>
      <div id="map" class="map tall"></div>
      <div class="cols">
        <div class="card"><h3>Planned vs actual</h3>
          ${out.planned.length ? `<table class="tbl"><tr><th>#</th><th>Planned stop</th><th>Visited</th></tr>${out.planned.map(x => {
            const v = visitedAt[x.id];
            return `<tr><td>${esc(x.order)}</td><td>${esc(x.name)}</td><td>${v ? `${esc(v.in)} ${outcomeChip(v.outcome)}` : '<span class="chip bad">Missed</span>'}</td></tr>`;
          }).join('')}</table>` : '<p class="muted small">No plan for this day.</p>'}
          ${unplanned.length ? `<h4>Unplanned visits</h4><ul class="list">${unplanned.map(v => `<li class="item small"><div class="body">${esc(v.in)} · ${esc(v.place)} ${outcomeChip(v.outcome)}</div></li>`).join('')}</ul>` : ''}
        </div>
        <div class="card"><h3>Visits</h3>
          ${out.visits.length ? `<div class="scroll-x"><table class="tbl"><tr><th>#</th><th>Time</th><th>Restaurant</th><th class="n">Min</th><th class="n">Score</th><th>Flags</th></tr>
          ${out.visits.map((v, i) => `<tr class="click" data-lead="${esc(v.locationId)}"><td>${i + 1}</td><td>${esc(v.in)}–${esc(v.out)}</td><td>${esc(v.place)}</td><td class="n">${esc(v.min)}</td><td class="n">${esc(v.score)}</td><td>${flagChips(v.flags)}</td></tr>`).join('')}
          </table></div>` : '<p class="muted small">No visits.</p>'}
        </div>
      </div>`;
    const map = makeMap($('#map', el));
    if (map) {
      const all = [];
      const line = out.points.map(x => [x[0], x[1]]);
      if (line.length > 1) L.polyline(line, { color: '#1d4ed8', weight: 4, opacity: 0.7 }).addTo(map);
      all.push.apply(all, line);
      out.planned.forEach(x => { if (Number(x.lat)) { L.marker([x.lat, x.lng], { icon: numIcon('P' + x.order, '#a8a29e') }).addTo(map).bindPopup('Planned: ' + esc(x.name)); all.push([x.lat, x.lng]); } });
      out.stops.forEach(s => { L.circleMarker([s.lat, s.lng], { radius: 10, color: '#b45309', fillOpacity: 0.3 }).addTo(map).bindPopup(`Stopped ${s.from}–${s.to} (${s.min} min)`); });
      out.visits.forEach((v, i) => { if (Number(v.lat)) { L.marker([v.lat, v.lng], { icon: numIcon(i + 1, '#15803d') }).addTo(map).bindPopup(`<b>${esc(v.place)}</b><br>${esc(v.in)}–${esc(v.out)} · ${esc(OUTCOME_LABEL[v.outcome] || '')}`); all.push([v.lat, v.lng]); } });
      fitTo(map, all);
    }
    $$('[data-lead]', el).forEach(tr => { tr.onclick = () => go('lead', { id: tr.dataset.lead }); });
  };
  $('#load', el).onclick = load;
  if (p.get('rep')) load();
}, { panel: true });

// ======================= REPORTS =======================

view('reports', async el => {
  const first = todayStr().slice(0, 8) + '01';
  el.innerHTML = `<div class="toolbar"><h2>Reports</h2><input type="date" id="from" value="${first}"><input type="date" id="to" value="${todayStr()}">
      <button class="btn small primary" id="load">Load</button><button class="btn small" id="xv">Export visits</button><button class="btn small" id="xl">Export leads</button><button class="btn small" id="pr">Print / PDF</button></div>
    <div id="b"><p class="muted">Loading…</p></div>`;
  const range = () => ({ from: $('#from', el).value, to: $('#to', el).value });
  const pct = (a, b) => (b ? Math.round(a * 100 / b) : 0) + '%';
  const table = (rows, first, firstLabel) => rows.length ? `<div class="scroll-x"><table class="tbl"><tr><th>${firstLabel}</th><th class="n">Visits</th><th class="n">Interested</th><th class="n">Demos</th>
    <th class="n">Not int.</th><th class="n">Follow-ups</th><th class="n">Avg min</th><th class="n">Avg score</th><th class="n">Flagged</th>${first === 'name' ? '<th class="n">Km</th>' : ''}</tr>
    ${rows.map(r => `<tr><td>${esc(r[first])}</td><td class="n">${r.visits}</td><td class="n">${r.interested}</td><td class="n">${r.demos}</td><td class="n">${r.notInterested}</td>
      <td class="n">${r.followUps}</td><td class="n">${r.avgMin}</td><td class="n">${r.avgScore}</td><td class="n">${r.flagged}</td>${first === 'name' ? `<td class="n">${r.km}</td>` : ''}</tr>`).join('')}
    </table></div>` : '<p class="muted small">No data.</p>';
  const load = async () => {
    let out;
    try { out = await api('reports', range()); } catch (e) { $('#b', el).innerHTML = `<div class="card error">${esc(e.message)}</div>`; return; }
    const f = out.funnel;
    const steps = [['Visited', f.visited], ['Interested', f.interested], ['Demo', f.demo], ['Closed', f.closed]];
    $('#b', el).innerHTML = `
      <div class="card funnel"><h3>Lead funnel · ${esc(out.from)} to ${esc(out.to)}</h3>
        ${steps.map((s, i) => `<div class="f-row"><span>${s[0]}</span><div class="track"><div class="fill" style="width:${f.visited ? s[1] * 100 / f.visited : 0}%"></div></div>
          <span class="num">${s[1]}${i ? `<small>${pct(s[1], steps[i - 1][1])} of prev.</small>` : ''}</span></div>`).join('')}
        <p class="muted small">Unique restaurants visited in this period, by their current stage.</p></div>
      <div class="card"><h3>Per rep</h3>${table(out.perRep, 'name', 'Rep')}</div>
      <div class="card"><h3>Per area</h3>${table(out.perArea, 'area', 'Area')}</div>`;
  };
  const exp = async type => {
    busy(true, 'Preparing export…');
    try {
      const r = range();
      const out = await api('exportData', Object.assign({ type }, r));
      downloadCSV(`restro360-${type}-${r.from}_${r.to}.csv`, out.headers, out.rows);
      if (out.truncated) toast('Export limit reached - only the first ' + out.rows.length + ' rows were exported', 'error');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy(false);
    }
  };
  $('#load', el).onclick = load;
  $('#xv', el).onclick = () => exp('visits');
  $('#xl', el).onclick = () => exp('leads');
  $('#pr', el).onclick = () => window.print();
  await load();
}, { panel: true });

// ======================= DUPLICATES =======================

view('dups', async el => {
  const out = await api('duplicates');
  const card = (title, l) => l ? `<div><h4>${title}</h4><dl class="kv">
      <dt>Name</dt><dd><a href="#lead?id=${encodeURIComponent(l.id)}">${esc(l.name)}</a></dd>
      <dt>Address</dt><dd>${esc(l.address || l.area || '-')}</dd><dt>Owner</dt><dd>${esc(l.ownerName || '-')} ${telLink(l.ownerPhone)}</dd>
      <dt>Rep</dt><dd>${esc(l.rep || '-')}</dd><dt>Stage</dt><dd>${stageChip(l.stage)}</dd><dt>Created</dt><dd>${esc(String(l.createdAt || '').slice(0, 10))}</dd>
    </dl></div>` : '';
  el.innerHTML = `<h2>Duplicate flags</h2>
    ${!out.canResolve ? '<p class="muted small">Leads owned by another team are masked. CEO / Admin decide ownership.</p>' : ''}
    ${out.rows.length ? out.rows.map(r => `
      <div class="card">
        <div class="spread"><div class="row"><span class="chip warn">${esc(MATCH_LABEL[r.matchType] || r.matchType)}</span><span class="chip ${r.status === 'Open' ? 'bad' : 'ok'}">${esc(r.status)}</span></div>
          <span class="muted small">${esc(r.createdAt)}${r.rep ? ' · by ' + esc(r.rep) : ''}</span></div>
        ${r.note ? `<div class="banner info" style="margin:12px 0 0">${esc(r.note)}</div>` : ''}
        <div class="cols" style="margin-top:8px">${card('New record', r.newLoc)}${card('Existing record', r.existing)}</div>
        ${out.canResolve && r.status === 'Open' ? `<div class="row" style="margin-top:12px">
          <button class="btn small primary" data-r="${esc(r.id)}" data-a="keep">Merge - keep existing owner</button>
          <button class="btn small" data-r="${esc(r.id)}" data-a="transfer">Merge - give to new rep</button>
          <button class="btn small ghost" data-r="${esc(r.id)}" data-a="dismiss">Not a duplicate</button></div>` : ''}
      </div>`).join('') : '<div class="card muted">No duplicate flags. 🎉</div>'}`;
  $$('[data-r]', el).forEach(b => {
    b.onclick = async () => {
      if (!(await ask(b.textContent + '?', 'Confirm'))) return;
      busy(true, 'Saving…');
      try { await api('resolveDuplicate', { id: b.dataset.r, action: b.dataset.a }); toast('Done', 'ok'); render(); } catch (e) { toast(e.message, 'error'); } finally { busy(false); }
    };
  });
}, { panel: true });
