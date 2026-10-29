'use strict';
/* Restro360 Field — PWA client.
 * Rep screens + shared helpers live here; manager / CEO screens are in panel.js.
 * Everything a rep saves goes into an IndexedDB queue first and syncs to Apps Script when online. */

const CFG = window.APP_CONFIG || {};
const APP_VERSION = '1.0.0';
const LOC_FIELDS = ['name', 'type', 'address', 'area', 'pincode', 'outlets', 'seating', 'cuisine', 'currentPOS',
  'posExpiry', 'ownerName', 'ownerPhone', 'ownerWhatsapp', 'ownerEmail', 'mgrName', 'mgrPhone', 'mgrWhatsapp',
  'mgrEmail', 'cardName', 'cardDesignation', 'cardPhone', 'cardEmail'];
const OUTCOMES = [
  { k: 'INTERESTED', label: 'Interested in Restro360' },
  { k: 'DEMO', label: 'Demo booked' },
  { k: 'FOLLOWUP', label: 'Follow-up needed' },
  { k: 'NOT_INTERESTED', label: 'Not interested' },
  { k: 'DM_NA', label: 'Decision maker not available' },
];
const OUTCOME_LABEL = { INTERESTED: 'Interested', DEMO: 'Demo booked', FOLLOWUP: 'Follow-up', NOT_INTERESTED: 'Not interested', DM_NA: 'DM not available' };
const OUTCOME_STATUS = { INTERESTED: 'Visited', DEMO: 'Visited', FOLLOWUP: 'Revisit', NOT_INTERESTED: 'Not interested', DM_NA: 'Revisit' };
const OUTCOME_COLOR = { INTERESTED: '#15803d', DEMO: '#1d4ed8', FOLLOWUP: '#b45309', NOT_INTERESTED: '#b91c1c', DM_NA: '#78716c' };
const STATUS_CHIP = { Pending: '', Visited: 'ok', Revisit: 'warn', Closed: 'info', 'Not interested': 'bad' };
const POS_LIST = ['None / manual billing', 'Petpooja', 'Posist', 'DotPe', 'Restroworks', 'Torqus', 'LimeTray', 'GoFrugal', 'Tally', 'Other'];
const NAV = {
  rep: [['home', '🏠', 'Home'], ['plan', '🗺️', 'Plan'], ['visit', '➕', 'Walk-in'], ['followups', '⏰', 'Follow-ups'], ['more', '☰', 'More']],
  panel: [['dash', '📊', 'Dashboard'], ['leads', '🍽️', 'Leads'], ['planner', '🧭', 'Plan route'], ['replay', '🛣️', 'Route replay'],
    ['reports', '📈', 'Reports'], ['dups', '⚠️', 'Duplicates'], ['more', '☰', 'More']],
};

const S = {
  token: localStorage.getItem('r360_token') || '',
  user: readJSON('r360_user'),
  settings: readJSON('r360_settings') || {},
  sheetUrl: localStorage.getItem('r360_sheet') || '',
  device: localStorage.getItem('r360_device') || '',
  day: null,
  lastPos: null,
  maps: [],
  timers: [],
  installPrompt: null,
};
if (!S.device) {
  S.device = uid('DEV');
  localStorage.setItem('r360_device', S.device);
}

// ======================= HELPERS =======================

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.from((r || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pad(n) { return String(n).padStart(2, '0'); }
function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function hhmm(ms) { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function isPanel() { return !!S.user && S.user.role !== 'REP'; }
function homeView() { return isPanel() ? 'dash' : 'home'; }
function fmtDist(m) { return m == null ? '' : m < 1000 ? m + ' m' : (m / 1000).toFixed(1) + ' km'; }
function telLink(p) { return p ? `<a href="tel:${esc(p)}">${esc(p)}</a>` : ''; }

function distM(a1, o1, a2, o2) {
  a1 = Number(a1); o1 = Number(o1); a2 = Number(a2); o2 = Number(o2);
  if (!a1 || !o1 || !a2 || !o2) return null;
  const r = Math.PI / 180;
  const h = Math.sin((a2 - a1) * r / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin((o2 - o1) * r / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

let toastTimer;
function toast(msg, type) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, type === 'error' ? 5000 : 3000);
}

function busy(on, text) {
  $('#busy').hidden = !on;
  if (text) $('#busyText').textContent = text;
}

function modal(html) {
  $('#modalBody').innerHTML = html;
  $('#modal').hidden = false;
  return $('#modalBody');
}

function closeModal() {
  $('#modal').hidden = true;
  $('#modalBody').innerHTML = '';
}

function ask(text, okLabel) {
  return new Promise(res => {
    const b = modal(`<p class="ask">${esc(text)}</p>
      <div class="row end"><button class="btn" data-a="0">Cancel</button><button class="btn primary" data-a="1">${esc(okLabel || 'Yes')}</button></div>`);
    $$('button[data-a]', b).forEach(x => { x.onclick = () => { closeModal(); res(x.dataset.a === '1'); }; });
  });
}

function formData(form) {
  const o = {};
  Array.from(form.elements).forEach(el => {
    if (!el.name || el.disabled) return;
    if (el.type === 'checkbox') {
      o[el.name] = o[el.name] || [];
      if (el.checked) o[el.name].push(el.value);
    } else if (el.type === 'radio') {
      if (el.checked) o[el.name] = el.value;
      else if (!(el.name in o)) o[el.name] = '';
    } else {
      o[el.name] = el.value.trim();
    }
  });
  return o;
}

function fillForm(form, o) {
  Array.from(form.elements).forEach(el => {
    if (!el.name || !(el.name in o)) return;
    const v = o[el.name];
    if (el.type === 'checkbox') el.checked = Array.isArray(v) && v.includes(el.value);
    else if (el.type === 'radio') el.checked = v === el.value;
    else el.value = v == null ? '' : v;
  });
}

function inp(name, label, type, extra) {
  return `<label>${label}<input name="${name}" type="${type || 'text'}" ${extra || ''}></label>`;
}

function sel(name, label, options, extra) {
  return `<label>${label}<select name="${name}" ${extra || ''}><option value="">Select…</option>${options.map(o => `<option>${esc(o)}</option>`).join('')}</select></label>`;
}

function uniq(arr) { return arr.filter((x, i) => x && arr.indexOf(x) === i); }

function waLink(phone, text) {
  const p = String(phone || '').replace(/\D/g, '').slice(-10);
  return p ? 'https://wa.me/91' + p + '?text=' + encodeURIComponent(text || '') : '';
}

function fileToDataUrl(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

function downloadCSV(name, headers, rows) {
  const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + [headers].concat(rows).map(r => r.map(cell).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ======================= LOCAL STORAGE (IndexedDB) =======================

const idb = (() => {
  let dbp;
  function open() {
    return dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('restro360', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('kv');
        r.result.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }
  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
    });
  }
  return {
    get: k => run('kv', 'readonly', s => s.get(k)),
    set: (k, v) => run('kv', 'readwrite', s => s.put(v, k)),
    del: k => run('kv', 'readwrite', s => s.delete(k)),
    keys: () => run('kv', 'readonly', s => s.getAllKeys()),
    qAdd: item => run('queue', 'readwrite', s => s.add(item)),
    qPut: item => run('queue', 'readwrite', s => s.put(item)),
    qAll: () => run('queue', 'readonly', s => s.getAll()),
    qDel: id => run('queue', 'readwrite', s => s.delete(id)),
    clear: async () => { await run('kv', 'readwrite', s => s.clear()); await run('queue', 'readwrite', s => s.clear()); },
  };
})();

// ======================= API =======================

async function api(action, data, opts) {
  opts = opts || {};
  if (!/^https?:\/\//.test(CFG.API_URL || '')) throw new Error('API_URL is not set in config.js');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 60000);
  let res;
  try {
    // No Content-Type header on purpose: text/plain avoids a CORS preflight, which Apps Script cannot answer.
    res = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ action, token: S.token, data: data || {} }), signal: ctrl.signal });
  } catch (e) {
    const err = new Error(e.name === 'AbortError' ? 'Server took too long. Will retry.' : 'No internet / server not reachable');
    err.network = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
  let out;
  try {
    out = await res.json();
  } catch (e) {
    const err = new Error('Server error (' + res.status + '). Check the Apps Script deployment access is "Anyone".');
    err.network = res.status >= 500;
    throw err;
  }
  if (!out.ok) {
    if (out.code === 'WIPE') await wipe();
    else if (out.code === 'AUTH') logout(true);
    const err = new Error(out.error || 'Request failed');
    err.code = out.code;
    throw err;
  }
  return out;
}

function saveSession(out) {
  if (out.token) S.token = out.token;
  S.user = out.user;
  S.settings = out.settings || {};
  S.sheetUrl = out.sheetUrl || '';
  localStorage.setItem('r360_token', S.token);
  localStorage.setItem('r360_user', JSON.stringify(S.user));
  localStorage.setItem('r360_settings', JSON.stringify(S.settings));
  localStorage.setItem('r360_sheet', S.sheetUrl);
}

function logout(expired) {
  ['r360_token', 'r360_user', 'r360_settings', 'r360_sheet'].forEach(k => localStorage.removeItem(k));
  S.token = '';
  S.user = null;
  S.day = null;
  Tracker.stop();
  if (expired) toast('Session ended. Please login again.', 'error');
  go('login');
}

async function wipe() {
  Tracker.stop(true);
  await idb.clear();
  logout(false);
  toast('Logged out by admin. Data on this phone was cleared.', 'error');
}

// ======================= OFFLINE QUEUE + SYNC =======================

const Sync = {
  busy: false,
  async add(action, data, label) {
    await idb.qAdd({ action, data, label, userId: S.user && S.user.id, at: Date.now(), tries: 0 });
    updatePill();
    this.run();
  },
  async run() {
    if (this.busy || !navigator.onLine || !S.token) return;
    this.busy = true;
    updatePill();
    try {
      const items = await idb.qAll();
      for (const it of items) {
        if (it.userId && S.user && it.userId !== S.user.id) continue;
        try {
          const out = await api(it.action, it.data, { timeout: 180000 });
          await idb.qDel(it.qid);
          if (out.message) await addNotice(it.label + ': ' + out.message);
          if (out.flags && out.flags.length) await addNotice(it.label + ' flagged: ' + out.flags.join(', ').replace(/_/g, ' ').toLowerCase());
        } catch (e) {
          if (e.network || e.code === 'AUTH' || e.code === 'WIPE') break;
          it.tries = (it.tries || 0) + 1;
          it.error = e.message;
          await idb.qPut(it);
        }
      }
      await idb.set('lastSync', Date.now());
    } finally {
      this.busy = false;
      updatePill();
    }
  },
};

async function pendingItems(action) {
  const all = await idb.qAll();
  return action ? all.filter(i => i.action === action) : all;
}

async function addNotice(msg) {
  const list = (await idb.get('notices')) || [];
  list.unshift({ t: Date.now(), msg });
  await idb.set('notices', list.slice(0, 20));
}

async function updatePill() {
  const pill = $('#syncPill');
  if (!S.token) { pill.hidden = true; return; }
  const n = (await idb.qAll()).length;
  if (isPanel() && navigator.onLine && !n) { pill.hidden = true; return; }
  pill.hidden = false;
  pill.className = 'pill' + (!navigator.onLine || n ? ' warn' : '');
  pill.textContent = Sync.busy ? 'Syncing…' : !navigator.onLine ? 'Offline' + (n ? ' · ' + n + ' saved' : '') : n ? n + ' to sync' : '✓ Synced';
}

// ======================= GPS =======================

function getPos(timeout) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('GPS not available on this device'));
    navigator.geolocation.getCurrentPosition(p => {
      S.lastPos = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy), ts: Date.now() };
      res(S.lastPos);
    }, e => rej(new Error(e.code === 1 ? 'Location permission denied. Allow location for this app in browser settings.' : 'Could not get GPS. Turn on location / move near a window.')),
    { enableHighAccuracy: true, timeout: timeout || 25000, maximumAge: 15000 });
  });
}

/** Records the route while the day is started and the app is open (browsers cannot track a closed PWA). */
const Tracker = {
  watchId: null, last: null, buf: [], timer: null,
  start() {
    if (this.watchId !== null || !navigator.geolocation || !S.user || isPanel()) return;
    this.watchId = navigator.geolocation.watchPosition(p => this.onPos(p), () => {}, { enableHighAccuracy: true, maximumAge: 20000, timeout: 60000 });
    this.timer = setInterval(() => this.flush(), 5 * 60000);
  },
  stop(discard) {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    clearInterval(this.timer);
    if (discard) this.buf = []; else this.flush();
  },
  onPos(p) {
    const pt = { ts: Date.now(), lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) };
    S.lastPos = pt;
    if (pt.acc > 150) return;
    const every = (S.settings.pingIntervalSec || 120) * 1000;
    const l = this.last;
    if (l && (pt.ts - l.ts < 20000 || (distM(l.lat, l.lng, pt.lat, pt.lng) < 30 && pt.ts - l.ts < every))) return;
    this.last = pt;
    this.buf.push(pt);
    if (this.buf.length >= 10) this.flush();
  },
  flush() {
    if (!this.buf.length || !S.token) return;
    const points = this.buf.splice(0);
    Sync.add('pings', { points }, 'GPS route');
  },
};

// ======================= CAMERA / MIC =======================

function pickImage(opts) {
  opts = opts || {};
  return new Promise(res => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (opts.capture !== false) input.capture = opts.capture || 'environment';
    input.onchange = async () => {
      const f = input.files && input.files[0];
      if (!f) return res(null);
      try { res(await compressImage(f, opts.maxSide || 1280, opts.quality || 0.7)); } catch (e) { toast('Could not read photo', 'error'); res(null); }
    };
    input.click();
  });
}

async function compressImage(file, maxSide, quality) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const Recorder = {
  rec: null, stream: null, chunks: [],
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start();
  },
  stop() {
    return new Promise(res => {
      this.rec.onstop = async () => {
        this.stream.getTracks().forEach(t => t.stop());
        res(await fileToDataUrl(new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' })));
      };
      this.rec.stop();
    });
  },
};

// ======================= MAPS (Leaflet + OpenStreetMap, free) =======================

function makeMap(el, center, zoom) {
  if (!window.L) {
    el.classList.add('map-off');
    el.textContent = 'Map needs internet';
    return null;
  }
  const m = L.map(el).setView(center || [22.5, 79], center ? (zoom || 14) : 5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
  S.maps.push(m);
  setTimeout(() => { if (S.maps.includes(m)) m.invalidateSize({ animate: false }); }, 50);
  return m;
}

function numIcon(label, color) {
  return L.divIcon({ className: 'pin', html: `<span style="background:${color}">${esc(label)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
}

function fitTo(map, latlngs) {
  const pts = latlngs.filter(p => p && Number(p[0]) && Number(p[1]));
  if (!map || !pts.length) return;
  if (pts.length === 1) map.setView(pts[0], 15, { animate: false });
  else map.fitBounds(pts, { padding: [30, 30], maxZoom: 16, animate: false });
}

async function showFile(url, title) {
  busy(true, 'Loading…');
  try {
    const out = await api('file', { url });
    const src = 'data:' + out.mime + ';base64,' + out.data;
    modal(`<h3>${esc(title || 'File')}</h3>` + (out.mime.indexOf('audio') === 0 ? `<audio controls autoplay src="${src}"></audio>` : `<img src="${src}" alt="">`));
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    busy(false);
  }
}

// ======================= ROUTER =======================

const VIEWS = {};
function view(name, fn, opts) { VIEWS[name] = Object.assign({ fn }, opts || {}); }

function go(name, params) {
  const target = '#' + name + (params ? '?' + new URLSearchParams(params) : '');
  if (location.hash === target) render();
  else location.hash = target;
}

async function render() {
  S.maps.forEach(m => m.remove());
  S.maps = [];
  S.timers.forEach(clearInterval);
  S.timers = [];
  const parts = location.hash.slice(1).split('?');
  const params = new URLSearchParams(parts[1] || '');
  let name = parts[0];
  if (!S.token || !S.user) name = 'login';
  else if (S.user.role === 'REP' && !S.user.consented) name = 'consent';
  else if (!VIEWS[name] || name === 'login' || name === 'consent' || (!VIEWS[name].shared && !!VIEWS[name].panel !== isPanel())) name = homeView();
  drawNav(name === 'visit' && params.get('id') ? 'plan' : name);
  const el = $('#view');
  el.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    await VIEWS[name].fn(el, params);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card error">${esc(e.message)}</div>`;
  }
}

function drawNav(active) {
  const nav = $('#nav');
  const bare = active === 'login' || active === 'consent';
  nav.hidden = bare;
  document.body.classList.toggle('has-nav', !bare);
  document.body.classList.toggle('panel', isPanel());
  $('#title').textContent = (S.settings.company || 'Restro360') + (isPanel() ? ' · ' + S.user.role.toLowerCase().replace(/^\w/, c => c.toUpperCase()) : ' Field');
  if (bare) return;
  nav.innerHTML = NAV[isPanel() ? 'panel' : 'rep'].map(n =>
    `<a href="#${n[0]}" class="${n[0] === active ? 'on' : ''}"><span class="i">${n[1]}</span>${n[2]}</a>`).join('');
}

// ======================= REP: DAY DATA =======================

async function loadDay() {
  const date = todayStr();
  if (navigator.onLine && S.token && !isPanel()) {
    try {
      const out = await api('myDay', { date });
      S.day = out;
      await idb.set('myDay', out);
      const local = (await idb.get('day:' + date)) || {};
      if (out.attendance && out.attendance.startAt && !local.start) local.start = out.attendance.startAt.slice(11, 16);
      if (out.attendance && out.attendance.endAt && !local.end) local.end = out.attendance.endAt.slice(11, 16);
      await idb.set('day:' + date, local);
      if (!(await pendingItems('saveVisit')).length) await idb.set('localStatus', {});
      return S.day;
    } catch (e) {
      if (!e.network) toast(e.message, 'error');
    }
  }
  if (!S.day) S.day = (await idb.get('myDay')) || null;
  return S.day;
}

function dayData() {
  const d = S.day || { leads: [], planIds: [], followUpIds: [], stats: {} };
  const fresh = d.date === todayStr();
  return { leads: d.leads || [], planIds: fresh ? d.planIds || [] : [], followUpIds: d.followUpIds || [], stats: fresh ? d.stats || {} : {}, fresh };
}

async function localDay() { return (await idb.get('day:' + todayStr())) || {}; }

async function startDay() {
  toast('Take a selfie to start your day');
  const selfie = await pickImage({ capture: 'user', maxSide: 640, quality: 0.6 });
  if (!selfie) return;
  busy(true, 'Getting GPS…');
  let pos;
  try { pos = await getPos(); } catch (e) { busy(false); return toast(e.message, 'error'); }
  busy(false);
  const ts = Date.now();
  await idb.set('day:' + todayStr(), { start: hhmm(ts) });
  await Sync.add('startDay', { id: uid('A'), ts, lat: pos.lat, lng: pos.lng, acc: pos.acc, selfie }, 'Day start');
  Tracker.start();
  toast('Day started. Keep the app open while travelling for route tracking.', 'ok');
  render();
}

async function endDay() {
  if (!(await ask('End your day? Route tracking will stop.', 'End day'))) return;
  toast('Take a selfie to end your day');
  const selfie = await pickImage({ capture: 'user', maxSide: 640, quality: 0.6 });
  if (!selfie) return;
  busy(true, 'Getting GPS…');
  let pos = {};
  try { pos = await getPos(); } catch (e) { /* end the day even without GPS */ }
  busy(false);
  Tracker.stop();
  const ts = Date.now();
  const local = await localDay();
  local.end = hhmm(ts);
  await idb.set('day:' + todayStr(), local);
  await Sync.add('endDay', { date: todayStr(), ts, lat: pos.lat, lng: pos.lng, selfie }, 'Day end');
  toast('Day ended. Good work!', 'ok');
  render();
}

async function localStatus() { return (await idb.get('localStatus')) || {}; }

// ======================= VIEWS: LOGIN & CONSENT =======================

view('login', async el => {
  el.innerHTML = `
    <div class="login">
      <div class="brand"><img src="icons/icon-192.png" alt=""><h2>${esc(CFG.APP_NAME || 'Restro360 Field')}</h2><p>Field sales app</p></div>
      <form id="f" class="card">
        ${inp('phone', 'Mobile number', 'tel', 'inputmode="numeric" autocomplete="tel" required placeholder="10-digit mobile"')}
        ${inp('pin', 'PIN', 'password', 'inputmode="numeric" required placeholder="PIN given by admin"')}
        <button class="btn primary block big">Login</button>
        <p class="muted small" style="margin-top:12px">Rep accounts work on one phone only. Changed phone? Ask admin to reset your device.</p>
      </form>
    </div>`;
  $('#f', el).onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target);
    busy(true, 'Logging in…');
    try {
      const out = await api('login', { phone: f.phone, pin: f.pin, deviceId: S.device, device: navigator.userAgent });
      saveSession(out);
      afterLogin();
      go(homeView());
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      busy(false);
    }
  };
});

view('consent', async el => {
  el.innerHTML = `
    <div class="card">
      <h2>Consent for location tracking</h2>
      <p>Under India's Digital Personal Data Protection Act, 2023 we need your written consent:</p>
      <ul>
        <li>Your GPS location is recorded <b>only between Start Day and End Day</b> (working hours), and only while this app is open.</li>
        <li>Day-start/end selfies, visit photos, business cards and voice notes are stored in the company's Google Drive.</li>
        <li>Your manager and company management can see your visits, route and expenses.</li>
        <li>You can ask your admin to delete your data as per company policy.</li>
      </ul>
      <form id="f">
        ${inp('name', 'Type your full name as signature', 'text', 'required')}
        <label class="check"><input type="checkbox" name="agree" value="1" required> I have read and agree to the above</label>
        <button class="btn primary block big" style="margin-top:8px">I agree</button>
      </form>
      <button class="btn ghost block" id="out" style="margin-top:8px">Logout</button>
    </div>`;
  $('#f', el).onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target);
    await Sync.add('consent', { name: f.name }, 'Consent');
    S.user.consented = true;
    localStorage.setItem('r360_user', JSON.stringify(S.user));
    go('home');
  };
  $('#out', el).onclick = () => logout(false);
});

// ======================= VIEWS: REP =======================

view('home', async el => {
  const draw = async () => {
    const local = await localDay();
    const dd = dayData();
    const pending = await pendingItems();
    const pendingVisits = pending.filter(i => i.action === 'saveVisit').length;
    const notices = (await idb.get('notices')) || [];
    const drafts = (await idb.keys()).filter(k => String(k).indexOf('draft:') === 0);
    const draftData = await Promise.all(drafts.map(k => idb.get(k)));
    const st = dd.stats;
    const dayCard = !local.start
      ? `<div class="spread"><div><b>Your day has not started</b><div class="muted small">Selfie + GPS check-in</div></div><button class="btn primary" id="start">Start day</button></div>`
      : !local.end
        ? `<div class="spread"><div><b>Day started at ${esc(local.start)}</b><div class="muted small">Route tracking is on while the app is open</div></div><button class="btn" id="end">End day</button></div>`
        : `<div><b>Day ended at ${esc(local.end)}</b><div class="muted small">Started ${esc(local.start)}. Good work!</div></div>`;
    el.innerHTML = `
      <h2>Namaste, ${esc((S.user.name || '').split(' ')[0])}</h2>
      <div class="card">${dayCard}</div>
      ${draftData.filter(Boolean).map(d => `<div class="banner warn spread"><span>Unfinished visit: <b>${esc(d.f.name || 'New lead')}</b></span><a class="btn small" href="#visit${d.locId ? '?id=' + encodeURIComponent(d.locId) : ''}">Resume</a></div>`).join('')}
      <div class="tiles">
        <div class="tile"><div class="v">${st.visits || 0}</div><div class="l">Visits today</div></div>
        <div class="tile"><div class="v">${st.interested || 0}</div><div class="l">Interested</div></div>
        <div class="tile"><div class="v">${st.demos || 0}</div><div class="l">Demos booked</div></div>
        <div class="tile"><div class="v">${st.km || 0}</div><div class="l">Km travelled</div></div>
      </div>
      ${pendingVisits ? `<div class="banner info">${pendingVisits} visit(s) saved on phone - will sync when internet is back.</div>` : ''}
      ${notices.length ? `<div class="card"><div class="spread"><h3>Updates</h3><button class="btn ghost small" id="clr">Clear</button></div>
        <ul class="list">${notices.slice(0, 6).map(n => `<li class="item"><div class="body small">${esc(n.msg)}<div class="muted">${hhmm(n.t)}</div></div></li>`).join('')}</ul></div>` : ''}
      <div class="quick">
        <a href="#plan"><span class="i">🗺️</span>Today's plan<small>${dd.planIds.length} stops</small></a>
        <a href="#visit"><span class="i">➕</span>Walk-in lead<small>New restaurant</small></a>
        <a href="#followups"><span class="i">⏰</span>Follow-ups<small>${dd.followUpIds.length} due</small></a>
        <a href="#expenses"><span class="i">⛽</span>Expenses<small>Fuel, travel</small></a>
      </div>`;
    const s = $('#start', el), e = $('#end', el), c = $('#clr', el);
    if (s) s.onclick = startDay;
    if (e) e.onclick = endDay;
    if (c) c.onclick = async () => { await idb.set('notices', []); draw(); };
  };
  await draw();
  if (await loadDay()) draw();
});

view('plan', async (el, p) => {
  if (!S.day) await loadDay();
  const tab = p.get('tab') || 'today';
  const ls = await localStatus();
  const dd = dayData();
  const byId = {};
  dd.leads.forEach(l => { byId[l.id] = l; });
  const planned = dd.planIds.map(id => byId[id]).filter(Boolean);
  let sortNear = false;

  const itemHtml = (l, i) => {
    const status = ls[l.id] || l.status || 'Pending';
    const d = S.lastPos ? distM(S.lastPos.lat, S.lastPos.lng, l.lat, l.lng) : null;
    const nav = l.lat ? `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([l.name, l.address].join(' '))}`;
    return `<li class="item">
      ${i != null ? `<span class="num">${i + 1}</span>` : ''}
      <div class="body">
        <div class="spread"><span class="t">${esc(l.name)}</span><span class="chip ${STATUS_CHIP[status] || ''}">${esc(status)}</span></div>
        <div class="muted small">${esc(l.address || l.area || '')}${d != null ? ' · ' + fmtDist(d) + ' away' : ''}</div>
        <div class="acts"><a class="btn small" href="${nav}" target="_blank" rel="noopener">Navigate</a>
          <a class="btn small primary" href="#visit?id=${encodeURIComponent(l.id)}">Start visit</a></div>
      </div></li>`;
  };

  const draw = () => {
    let list = planned.slice();
    if (sortNear && S.lastPos) list.sort((a, b) => (distM(S.lastPos.lat, S.lastPos.lng, a.lat, a.lng) || 9e9) - (distM(S.lastPos.lat, S.lastPos.lng, b.lat, b.lng) || 9e9));
    el.innerHTML = `
      <div class="toolbar"><h2>My plan</h2>
        <a class="btn small ${tab === 'today' ? 'primary' : ''}" href="#plan?tab=today">Today (${planned.length})</a>
        <a class="btn small ${tab === 'all' ? 'primary' : ''}" href="#plan?tab=all">All my leads (${dd.leads.length})</a></div>
      ${tab === 'today' ? `
        <div id="map" class="map"></div>
        <div class="card">
          <div class="spread"><span class="muted small">${dd.fresh ? 'Order set by your manager' : 'Offline - showing last saved data'}</span>
            <button class="btn small" id="near">${sortNear ? 'Manager order' : 'Nearest first'}</button></div>
          ${list.length ? `<ul class="list">${list.map((l, i) => itemHtml(l, sortNear ? null : i)).join('')}</ul>` : '<p class="muted center" style="margin:16px 0 4px">No stops planned for today. Add walk-in leads or check with your manager.</p>'}
        </div>` : `
        <input id="q" placeholder="Search name, area, phone…" style="margin:0 0 12px">
        <div class="card"><ul class="list" id="all"></ul></div>`}`;
    if (tab === 'today') {
      const map = makeMap($('#map', el));
      if (map) {
        list.forEach((l, i) => { if (Number(l.lat)) L.marker([l.lat, l.lng], { icon: numIcon(sortNear ? '•' : i + 1, '#ea580c') }).addTo(map).bindPopup(esc(l.name)); });
        if (S.lastPos) L.circleMarker([S.lastPos.lat, S.lastPos.lng], { radius: 8, color: '#1d4ed8', fillOpacity: 0.8 }).addTo(map).bindPopup('You');
        fitTo(map, list.map(l => [l.lat, l.lng]).concat(S.lastPos ? [[S.lastPos.lat, S.lastPos.lng]] : []));
      }
      $('#near', el).onclick = async () => {
        if (!sortNear) { try { await getPos(); } catch (e) { return toast(e.message, 'error'); } }
        sortNear = !sortNear;
        S.maps.forEach(m => m.remove());
        S.maps = [];
        draw();
      };
    } else {
      const drawAll = q => {
        q = (q || '').toLowerCase();
        const rows = dd.leads.filter(l => !q || [l.name, l.area, l.address, l.ownerName, l.ownerPhone, l.pincode].join(' ').toLowerCase().includes(q)).slice(0, 150);
        $('#all', el).innerHTML = rows.length ? rows.map(l => itemHtml(l, null)).join('') : '<p class="muted center">No leads found</p>';
      };
      $('#q', el).oninput = e => drawAll(e.target.value);
      drawAll('');
    }
  };
  draw();
  if (!S.lastPos) getPos().then(() => { if (location.hash.indexOf('#plan') === 0) { S.maps.forEach(m => m.remove()); S.maps = []; draw(); } }).catch(() => {});
});

view('visit', async (el, p) => {
  let local = await localDay();
  if (!local.start && navigator.onLine) {
    await loadDay();
    local = await localDay();
  }
  if (!local.start) {
    el.innerHTML = `<div class="card center"><h3>Start your day first</h3><p class="muted">Visits can be recorded after the day-start selfie.</p><button class="btn primary" id="s">Start day</button></div>`;
    $('#s', el).onclick = startDay;
    return;
  }
  if (!S.day) await loadDay();
  const id = p.get('id') || '';
  const lead = id ? dayData().leads.find(l => l.id === id) : null;
  if (id && !lead) {
    el.innerHTML = '<div class="card error">This lead is not on your phone. Open Plan when online to refresh.</div>';
    return;
  }
  const key = 'draft:' + (id || 'new');
  let d = await idb.get(key);
  if (!d) {
    d = { vid: uid('V'), locId: id, newLocId: id ? '' : uid('L'), checkInAt: Date.now(), f: {}, media: {}, gps: null };
    if (lead) LOC_FIELDS.forEach(k => { if (lead[k]) d.f[k] = lead[k]; });
    await idb.set(key, d);
  }
  const st = S.settings;
  const saveDraft = () => idb.set(key, d);

  el.innerHTML = `
    <div class="card">
      <div class="spread"><div><b>${lead ? esc(lead.name) : 'New walk-in lead'}</b>
        <div class="muted small">Checked in at ${hhmm(d.checkInAt)}</div></div>
        <button class="btn small" id="gpsRetry">Refresh GPS</button></div>
      <div id="gpsBox" class="gps muted small" style="margin-top:8px">Getting GPS…</div>
    </div>
    <div id="dupBox"></div>
    <form id="vf" novalidate>
      <section class="card"><h3>1. Business details</h3>
        ${inp('name', 'Restaurant name *', 'text', 'required')}
        <div class="grid2">
          ${sel('type', 'Type', uniq((st.businessTypes || []).concat(d.f.type || [])))}
          ${inp('cuisine', 'Cuisine', 'text', 'placeholder="North Indian, Chinese…"')}
          ${inp('outlets', 'Outlets', 'number', 'inputmode="numeric" min="1"')}
          ${inp('seating', 'Seating capacity', 'number', 'inputmode="numeric" min="0"')}
        </div>
        <div class="grid2">
          <label>Current POS / billing<input name="currentPOS" list="posList" placeholder="Petpooja, manual…"></label>
          ${inp('posExpiry', 'Contract expiry', 'date')}
        </div>
        <datalist id="posList">${POS_LIST.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
        ${inp('address', 'Address')}
        <div class="grid2">${inp('area', 'Area / locality')}${inp('pincode', 'Pincode', 'text', 'inputmode="numeric" maxlength="6"')}</div>
      </section>

      <section class="card"><h3>2. Contacts</h3>
        <h4>Owner</h4>
        ${inp('ownerName', 'Name')}
        <div class="grid2">${inp('ownerPhone', 'Phone', 'tel', 'inputmode="tel"')}${inp('ownerWhatsapp', 'WhatsApp', 'tel', 'inputmode="tel"')}</div>
        ${inp('ownerEmail', 'Email', 'email')}
        <h4>Manager / IT person</h4>
        ${inp('mgrName', 'Name')}
        <div class="grid2">${inp('mgrPhone', 'Phone', 'tel', 'inputmode="tel"')}${inp('mgrWhatsapp', 'WhatsApp', 'tel', 'inputmode="tel"')}</div>
        ${inp('mgrEmail', 'Email', 'email')}
      </section>

      <section class="card"><h3>3. Business card</h3>
        <div class="card-photo" id="cardShot"></div>
        <div class="row"><button type="button" class="btn" id="cardBtn">📷 Capture card</button><span id="ocrStatus" class="muted small"></span></div>
        <div class="grid2" style="margin-top:12px">
          ${inp('cardName', 'Name on card')}${inp('cardDesignation', 'Designation')}
          ${inp('cardPhone', 'Phone on card', 'tel')}${inp('cardEmail', 'Email on card', 'email')}
        </div>
        <div class="row"><button type="button" class="btn small" id="toOwner">Copy to Owner</button><button type="button" class="btn small" id="toMgr">Copy to Manager</button></div>
      </section>

      <section class="card"><h3>4. Photos</h3>
        <div class="shots">
          ${[['storefront', 'Storefront'], ['interior', 'Interior'], ['counter', 'Billing counter']].map(x => `<div class="shot" data-k="${x[0]}"><span class="i">📷</span>${x[1]}</div>`).join('')}
        </div>
      </section>

      <section class="card"><h3>5. Remarks</h3>
        <label>Notes (Hindi or English)<textarea name="remarks" placeholder="What did the owner say? Pain points, budget, competitor…"></textarea></label>
        <div id="voice"></div>
      </section>

      <section class="card outcomes"><h3>6. Outcome *</h3>
        ${OUTCOMES.map(o => `<label><input type="radio" name="outcome" value="${o.k}"> ${o.label}</label>`).join('')}
        <div class="extra" data-for="INTERESTED DEMO"><h4>Modules interested in</h4>
          <div class="checks">${(st.modules || []).map(m => `<label class="check"><input type="checkbox" name="modules" value="${esc(m)}"> ${esc(m)}</label>`).join('')}</div></div>
        <div class="extra" data-for="DEMO">${inp('demoAt', 'Demo date & time *', 'datetime-local')}</div>
        <div class="extra" data-for="FOLLOWUP DM_NA">${inp('followUpAt', 'Follow-up date', 'date')}</div>
        <div class="extra" data-for="NOT_INTERESTED">${sel('reason', 'Reason *', st.reasons || [])}</div>
      </section>

      <button class="btn primary block big">Check-out & save visit</button>
      <button type="button" class="btn ghost block" id="discard" style="margin-top:8px">Discard this visit</button>
    </form>`;

  const form = $('#vf', el);
  fillForm(form, d.f);

  const showExtras = () => {
    const o = (form.querySelector('input[name=outcome]:checked') || {}).value || '';
    $$('.extra', form).forEach(x => { x.hidden = x.dataset.for.split(' ').indexOf(o) < 0; });
  };
  showExtras();

  let t;
  const onChange = () => {
    showExtras();
    clearTimeout(t);
    t = setTimeout(() => { d.f = formData(form); saveDraft(); }, 400);
  };
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);

  // ---- GPS / geofence ----
  const drawGps = () => {
    const box = $('#gpsBox', el);
    if (!d.gps) return;
    const dist = lead ? distM(lead.lat, lead.lng, d.gps.lat, d.gps.lng) : null;
    const fence = st.geofenceM || 150;
    if (dist == null) box.innerHTML = `📍 Location captured (±${d.gps.acc} m)`;
    else if (dist <= fence) box.innerHTML = `<span class="chip ok">At location</span> ${fmtDist(dist)} from saved pin (±${d.gps.acc} m)`;
    else box.innerHTML = `<span class="chip bad">Too far</span> You are ${fmtDist(dist)} from the saved location. The visit will be flagged.`;
    if (d.gps.acc > 200) box.innerHTML += '<div class="muted">GPS is weak here - try near the entrance and tap Refresh GPS.</div>';
  };
  const captureGps = async () => {
    $('#gpsBox', el).textContent = 'Getting GPS…';
    try {
      d.gps = await getPos();
      await saveDraft();
      drawGps();
      if (!lead && navigator.onLine && !form.address.value) {
        api('geocode', { lat: d.gps.lat, lng: d.gps.lng }).then(g => {
          ['address', 'area', 'pincode'].forEach(k => { if (g[k] && !form[k].value) form[k].value = g[k]; });
          onChange();
        }).catch(() => {});
      }
    } catch (e) {
      $('#gpsBox', el).innerHTML = `<span class="chip bad">No GPS</span> ${esc(e.message)}`;
    }
  };
  $('#gpsRetry', el).onclick = captureGps;
  if (d.gps) drawGps(); else captureGps();

  // ---- duplicate check (new leads, online) ----
  if (!lead) {
    let dt;
    const check = () => {
      clearTimeout(dt);
      dt = setTimeout(async () => {
        const f = formData(form);
        if (!navigator.onLine || (!f.name && !f.ownerPhone && !f.mgrPhone)) return;
        try {
          const out = await api('checkDuplicate', { location: Object.assign({}, f, { id: d.newLocId, lat: d.gps && d.gps.lat, lng: d.gps && d.gps.lng }) });
          $('#dupBox', el).innerHTML = out.duplicate ? `<div class="banner warn">⚠ ${esc(out.message)}</div>` : '';
        } catch (e) { /* offline or server busy: server checks again on save */ }
      }, 700);
    };
    ['name', 'ownerPhone', 'mgrPhone', 'ownerEmail', 'cardPhone'].forEach(n => form.elements.namedItem(n).addEventListener('change', check));
  }

  // ---- business card + OCR ----
  const drawCard = () => { $('#cardShot', el).innerHTML = d.media.card ? `<img src="${d.media.card}" alt="Business card">` : ''; };
  drawCard();
  $('#cardBtn', el).onclick = async () => {
    const img = await pickImage({ maxSide: 1600, quality: 0.85 });
    if (!img) return;
    d.media.card = img;
    await saveDraft();
    drawCard();
    if (!navigator.onLine) { $('#ocrStatus', el).textContent = 'Offline - fill the fields by hand'; return; }
    $('#ocrStatus', el).textContent = 'Reading card…';
    try {
      const out = await api('ocrCard', { image: img }, { timeout: 90000 });
      const c = out.fields || {};
      if (c.name) form.cardName.value = c.name;
      if (c.designation) form.cardDesignation.value = c.designation;
      if (c.phone) form.cardPhone.value = c.phone;
      if (c.email) form.cardEmail.value = c.email;
      if (c.address && !form.address.value) form.address.value = c.address;
      $('#ocrStatus', el).textContent = c.name || c.phone || c.email ? 'Filled from card - please check' : 'Could not read card - fill by hand';
      onChange();
    } catch (e) {
      $('#ocrStatus', el).textContent = e.message;
    }
  };
  const copyCard = who => {
    const pre = who === 'owner' ? 'owner' : 'mgr';
    if (form.cardName.value) form[pre + 'Name'].value = form.cardName.value;
    if (form.cardPhone.value) {
      form[pre + 'Phone'].value = form.cardPhone.value;
      if (!form[pre + 'Whatsapp'].value) form[pre + 'Whatsapp'].value = form.cardPhone.value;
    }
    if (form.cardEmail.value) form[pre + 'Email'].value = form.cardEmail.value;
    onChange();
    toast('Copied');
  };
  $('#toOwner', el).onclick = () => copyCard('owner');
  $('#toMgr', el).onclick = () => copyCard('mgr');

  // ---- photos ----
  const drawShots = () => {
    $$('.shot', el).forEach(s => {
      const k = s.dataset.k;
      $$('img, .x', s).forEach(x => x.remove());
      if (d.media[k]) s.insertAdjacentHTML('beforeend', `<img src="${d.media[k]}" alt=""><button type="button" class="x" aria-label="Remove">×</button>`);
    });
  };
  drawShots();
  $$('.shot', el).forEach(s => {
    s.onclick = async e => {
      const k = s.dataset.k;
      if (e.target.classList.contains('x')) { delete d.media[k]; await saveDraft(); return drawShots(); }
      const img = await pickImage();
      if (!img) return;
      d.media[k] = img;
      await saveDraft();
      drawShots();
    };
  });

  // ---- voice note ----
  const voice = $('#voice', el);
  let recTimer;
  const drawVoice = state => {
    if (state === 'rec') {
      const t0 = Date.now();
      voice.innerHTML = `<div class="rec"><span class="dot"></span><span id="rt">0:00</span><button type="button" class="btn small" id="stop">■ Stop</button></div>`;
      recTimer = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        const rt = $('#rt', voice);
        if (rt) rt.textContent = Math.floor(s / 60) + ':' + pad(s % 60);
        if (s >= 180) $('#stop', voice).click();
      }, 500);
      $('#stop', voice).onclick = async () => {
        clearInterval(recTimer);
        d.media.audio = await Recorder.stop();
        await saveDraft();
        drawVoice();
      };
    } else if (d.media.audio) {
      voice.innerHTML = `<div class="rec"><audio controls src="${d.media.audio}"></audio><button type="button" class="btn small danger" id="del">Delete</button></div>`;
      $('#del', voice).onclick = async () => { delete d.media.audio; await saveDraft(); drawVoice(); };
    } else {
      voice.innerHTML = `<button type="button" class="btn" id="rec">🎙️ Record voice note</button> <span class="muted small">max 3 min</span>`;
      $('#rec', voice).onclick = async () => {
        try { await Recorder.start(); drawVoice('rec'); } catch (e) { toast('Microphone permission needed', 'error'); }
      };
    }
  };
  drawVoice();

  // ---- discard / save ----
  $('#discard', el).onclick = async () => {
    if (!(await ask('Discard this visit? Photos and notes will be deleted.', 'Discard'))) return;
    await idb.del(key);
    go(lead ? 'plan' : 'home');
  };

  form.onsubmit = async e => {
    e.preventDefault();
    const f = d.f = formData(form);
    if (!f.name) return toast('Restaurant name is required', 'error');
    if (!f.outcome) return toast('Select the visit outcome', 'error');
    if (f.outcome === 'DEMO' && !f.demoAt) return toast('Pick the demo date & time', 'error');
    if (f.outcome === 'FOLLOWUP' && !f.followUpAt) return toast('Pick the follow-up date', 'error');
    if (f.outcome === 'NOT_INTERESTED' && !f.reason) return toast('Select a reason', 'error');
    if (!d.gps && !(await ask('GPS was not captured. Save anyway? The visit will be flagged.', 'Save'))) return;
    const checkOutAt = Date.now();
    const mins = Math.round((checkOutAt - d.checkInAt) / 60000);
    if (mins < (st.minVisitMin || 5) && !(await ask(`This visit is only ${mins} min. Short visits are flagged. Save anyway?`, 'Save'))) return;

    const location = { id: d.locId || d.newLocId };
    LOC_FIELDS.forEach(k => { if (f[k] !== undefined) location[k] = f[k]; });
    if (!d.locId && d.gps) { location.lat = d.gps.lat; location.lng = d.gps.lng; }
    const visit = {
      id: d.vid, locationId: d.locId, checkInAt: d.checkInAt, checkOutAt,
      lat: d.gps && d.gps.lat, lng: d.gps && d.gps.lng, accuracy: d.gps && d.gps.acc,
      outcome: f.outcome, modules: f.modules || [], demoAt: f.demoAt, followUpAt: f.followUpAt, reason: f.reason, remarks: f.remarks,
    };
    await Sync.add('saveVisit', { visit, location, files: d.media }, f.name);
    await idb.del(key);
    if (d.locId) {
      const ls = await localStatus();
      ls[d.locId] = OUTCOME_STATUS[f.outcome];
      await idb.set('localStatus', ls);
    }
    visitDone(f);
  };
});

function visitDone(f) {
  const phone = f.ownerWhatsapp || f.ownerPhone || f.mgrWhatsapp || f.mgrPhone;
  const msg = String(S.settings.whatsappTemplate || 'Namaste {name}, thank you for your time today.')
    .replace(/\{name\}/g, f.ownerName || f.name).replace(/\{rep\}/g, S.user.name || '').replace(/\{brochure\}/g, S.settings.brochureUrl || '');
  const link = waLink(phone, msg);
  $('#view').innerHTML = `
    <div class="card center">
      <div style="font-size:44px">✅</div>
      <h2>Visit saved</h2>
      <p class="muted">${navigator.onLine ? 'Uploading in the background.' : 'Saved on phone - it will upload when internet is back.'}</p>
      ${link ? `<a class="btn primary block big" href="${link}" target="_blank" rel="noopener">Send intro on WhatsApp</a>` : ''}
      <div class="row" style="justify-content:center;margin-top:12px"><a class="btn" href="#plan">Back to plan</a><a class="btn" href="#home">Home</a></div>
    </div>`;
  window.scrollTo(0, 0);
}

view('followups', async el => {
  if (!S.day) await loadDay();
  const dd = dayData();
  const ids = {};
  dd.followUpIds.forEach(x => { ids[x] = true; });
  const rows = dd.leads.filter(l => ids[l.id]).map(l => Object.assign({ when: l.demoAt || l.nextFollowUp || '' }, l))
    .sort((a, b) => a.when.localeCompare(b.when));
  const today = todayStr();
  el.innerHTML = `<h2>Follow-ups & demos</h2>
    <div class="card">${rows.length ? `<ul class="list">${rows.map(l => {
      const isDemo = l.demoAt && l.demoAt.slice(0, 10) >= today;
      const due = l.when.slice(0, 10);
      const phone = l.ownerPhone || l.mgrPhone;
      return `<li class="item"><div class="body">
        <div class="spread"><span class="t">${esc(l.name)}</span><span class="chip ${due < today ? 'bad' : due === today ? 'warn' : 'info'}">${isDemo ? 'Demo ' : ''}${esc(l.when)}</span></div>
        <div class="muted small">${esc(l.ownerName || '')} ${telLink(phone)} · ${esc(l.area || l.address || '')}</div>
        <div class="acts">${phone ? `<a class="btn small" href="tel:${esc(phone)}">Call</a>` : ''}
          ${phone ? `<a class="btn small" href="${waLink(l.ownerWhatsapp || phone, '')}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          <a class="btn small primary" href="#visit?id=${encodeURIComponent(l.id)}">Start visit</a></div></div></li>`;
    }).join('')}</ul>` : '<p class="muted center" style="margin:12px 0">No follow-ups due today or tomorrow.</p>'}</div>`;
});

view('expenses', async el => {
  const st = S.settings;
  let receipt = null;
  el.innerHTML = `<h2>Expenses</h2>
    <form id="ef" class="card">
      <div class="grid2">${inp('date', 'Date', 'date', 'required value="' + todayStr() + '"')}${sel('category', 'Category', st.expenseCategories || ['Fuel', 'Travel', 'Food', 'Other'], 'required')}</div>
      ${inp('amount', 'Amount (₹)', 'number', 'inputmode="decimal" min="1" step="any" required')}
      ${inp('note', 'Note', 'text', 'placeholder="e.g. Petrol, auto fare"')}
      <div class="row" style="margin-bottom:12px"><button type="button" class="btn" id="rb">📷 Receipt photo</button><span id="rs" class="muted small"></span></div>
      <button class="btn primary block">Save expense</button>
    </form>
    <div class="card"><h3>Recent</h3><div id="list" class="muted small">Loading…</div></div>`;
  $('#rb', el).onclick = async () => {
    receipt = await pickImage({ maxSide: 1280, quality: 0.7 });
    $('#rs', el).textContent = receipt ? 'Receipt attached ✓' : '';
  };
  const drawList = async () => {
    const pending = (await pendingItems('addExpense')).map(i => Object.assign({ status: 'Waiting to sync' }, i.data));
    let rows = [];
    if (navigator.onLine) {
      try { rows = (await api('myExpenses')).rows; } catch (e) { /* show pending only */ }
    }
    const all = pending.concat(rows);
    $('#list', el).innerHTML = all.length ? `<table class="tbl"><tr><th>Date</th><th>Type</th><th class="n">₹</th><th>Status</th></tr>${all.map(r =>
      `<tr><td>${esc(r.date)}</td><td>${esc(r.category)}<div class="muted">${esc(r.note || '')}</div></td><td class="n">${esc(r.amount)}</td><td><span class="chip">${esc(r.status)}</span></td></tr>`).join('')}</table>`
      : (navigator.onLine ? 'No expenses yet' : 'Offline');
  };
  $('#ef', el).onsubmit = async e => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.category || !(Number(f.amount) > 0)) return toast('Enter category and amount', 'error');
    await Sync.add('addExpense', { id: uid('E'), date: f.date, category: f.category, amount: f.amount, note: f.note, receipt }, 'Expense ₹' + f.amount);
    toast('Expense saved', 'ok');
    e.target.reset();
    e.target.date.value = todayStr();
    receipt = null;
    $('#rs', el).textContent = '';
    setTimeout(drawList, 1500);
  };
  drawList();
});

view('more', async el => {
  const st = S.settings;
  const q = await pendingItems();
  const last = await idb.get('lastSync');
  const links = [['Brochure', st.brochureUrl], ['Demo video', st.demoVideoUrl], ['Price sheet', st.priceSheetUrl]].filter(x => x[1]);
  el.innerHTML = `<h2>More</h2>
    <div class="card"><div class="spread"><div><b>${esc(S.user.name)}</b><div class="muted small">${esc(S.user.role)} · ${esc(S.user.phone)}</div></div>
      <button class="btn danger small" id="out">Logout</button></div></div>
    ${!isPanel() ? `<div class="card"><h3>Pitch kit</h3>${links.length ? `<div class="row">${links.map(x => `<a class="btn" href="${esc(x[1])}" target="_blank" rel="noopener">${x[0]}</a>`).join('')}</div>` : '<p class="muted small">Admin can add brochure / video / price links in the Settings sheet.</p>'}
      <div class="row" style="margin-top:10px"><a class="btn" href="#expenses">⛽ Expenses</a></div></div>` : ''}
    ${S.sheetUrl ? `<div class="card"><h3>Admin</h3><p class="muted small">Users, PINs, settings and location lists are managed directly in the Google Sheet.</p><a class="btn" href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">Open Google Sheet</a></div>` : ''}
    <div class="card"><div class="spread"><h3>Sync</h3><button class="btn small" id="sync">Sync now</button></div>
      <p class="muted small">${navigator.onLine ? 'Online' : 'Offline'} · last sync ${last ? new Date(last).toLocaleString() : 'never'}</p>
      ${q.length ? `<ul class="list">${q.map(i => `<li class="item"><div class="body"><div class="spread"><span>${esc(i.label)}</span>
        <button class="btn ghost small" data-del="${i.qid}">Remove</button></div><div class="muted small">${new Date(i.at).toLocaleString()}${i.error ? ' · <span style="color:var(--bad)">' + esc(i.error) + '</span>' : ''}</div></div></li>`).join('')}</ul>` : '<p class="small">Everything is synced ✓</p>'}
    </div>
    ${S.installPrompt ? '<button class="btn block" id="inst">Install app on this phone</button>' : ''}
    <p class="muted small center" style="margin-top:16px">Restro360 Field v${APP_VERSION}</p>`;
  $('#out', el).onclick = async () => {
    if (q.length && !(await ask(q.length + ' item(s) are not synced yet and will be lost if you logout. Logout anyway?', 'Logout'))) return;
    if (q.length) await idb.clear();
    logout(false);
  };
  $('#sync', el).onclick = async () => { await Sync.run(); render(); };
  $$('[data-del]', el).forEach(b => {
    b.onclick = async () => {
      if (!(await ask('Remove this unsynced item? Its data will be lost.', 'Remove'))) return;
      await idb.qDel(Number(b.dataset.del));
      updatePill();
      render();
    };
  });
  const inst = $('#inst', el);
  if (inst) inst.onclick = async () => { S.installPrompt.prompt(); S.installPrompt = null; inst.remove(); };
}, { shared: true });

// ======================= BOOT =======================

async function afterLogin() {
  updatePill();
  Sync.run();
  if (!isPanel()) {
    const local = await localDay();
    if (local.start && !local.end) Tracker.start();
    loadDay();
  }
}

function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  $('.modal-x').onclick = closeModal;
  $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
  $('#syncPill').onclick = () => go('more');
  window.addEventListener('hashchange', render);
  window.addEventListener('online', () => { updatePill(); Sync.run(); });
  window.addEventListener('offline', updatePill);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installPrompt = e; });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Tracker.flush();
    else Sync.run();
  });
  setInterval(() => Sync.run(), 60000);
  if (S.token) afterLogin();
  render();
}

document.addEventListener('DOMContentLoaded', boot);
