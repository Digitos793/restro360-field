/**
 * Restro360 Field Sales — Google Apps Script backend
 * --------------------------------------------------
 * Google Sheet  = database (one tab per table)
 * Google Drive  = photos, selfies, business cards, voice notes
 * PWA (pwa/ folder) talks to this script through doPost (JSON).
 *
 * Deploy: Deploy > New deployment > Web app
 *         Execute as: Me    Who has access: Anyone
 */

const VERSION = '1.0.0';
const TZ = 'Asia/Kolkata';
const PANEL = ['MANAGER', 'CEO', 'ADMIN'];
const TOP = ['CEO', 'ADMIN'];

const SCHEMA = {
  Users: ['id', 'name', 'phone', 'email', 'role', 'managerPhone', 'pin', 'active', 'deviceId', 'token',
    'forceLogout', 'consentAt', 'consentName', 'lastLat', 'lastLng', 'lastSeen', 'createdAt'],
  Locations: ['id', 'name', 'type', 'address', 'area', 'pincode', 'lat', 'lng', 'outlets', 'seating', 'cuisine',
    'currentPOS', 'posExpiry', 'ownerName', 'ownerPhone', 'ownerWhatsapp', 'ownerEmail', 'mgrName', 'mgrPhone',
    'mgrWhatsapp', 'mgrEmail', 'cardName', 'cardDesignation', 'cardPhone', 'cardEmail', 'cardUrl', 'status', 'stage',
    'assignedRepId', 'planDate', 'planOrder', 'ownerRepId', 'ownerTeamId', 'ownedSince', 'dupOf', 'nextFollowUp',
    'demoAt', 'lastVisitAt', 'source', 'createdBy', 'createdAt', 'updatedAt'],
  Visits: ['id', 'locationId', 'repId', 'teamId', 'checkInAt', 'checkOutAt', 'durationMin', 'lat', 'lng', 'accuracy',
    'distanceM', 'outcome', 'modules', 'demoAt', 'followUpAt', 'notInterestedReason', 'remarks', 'photoStorefront',
    'photoInterior', 'photoCounter', 'cardUrl', 'audioUrl', 'qualityScore', 'flags', 'duplicateOf', 'createdAt'],
  Attendance: ['id', 'repId', 'date', 'startAt', 'startLat', 'startLng', 'startSelfie', 'endAt', 'endLat', 'endLng',
    'endSelfie', 'km'],
  Expenses: ['id', 'repId', 'date', 'category', 'amount', 'note', 'receiptUrl', 'status', 'createdAt'],
  Duplicates: ['id', 'createdAt', 'newLocationId', 'existingLocationId', 'matchType', 'repId', 'repTeamId',
    'ownerTeamId', 'status', 'resolvedBy', 'resolvedAt'],
  Audit: ['ts', 'userId', 'action', 'entity', 'entityId', 'detail'],
  Settings: ['key', 'value', 'note'],
};
const TRACK_HEADERS = ['repId', 'ts', 'lat', 'lng', 'accuracy'];

const DEFAULT_SETTINGS = [
  ['COMPANY', 'Restro360', 'Product name shown in the app'],
  ['GEOFENCE_M', '150', 'Check-in further than this (metres) from a known location is flagged'],
  ['DUP_RADIUS_M', '50', 'Same name within this radius (metres) = duplicate'],
  ['LEAD_PROTECT_DAYS', '30', 'A lead stays with the first rep for these many days'],
  ['MIN_VISIT_MIN', '5', 'Visits shorter than this (minutes) are flagged'],
  ['DAILY_CAPACITY', '12', 'Max planned visits per rep per day'],
  ['PING_INTERVAL_SEC', '120', 'GPS ping interval while the app is open and the day is started'],
  ['EXPORT_LIMIT_MANAGER', '1000', 'Max rows a manager can export at once'],
  ['BUSINESS_TYPES', 'Restaurant,Cafe,Cloud Kitchen,Hotel,QSR,Bakery,Bar / Pub,Sweet Shop,Food Court,Other', 'Comma separated'],
  ['MODULES', 'Billing / POS,KOT,Inventory,Online Orders,CRM & Loyalty,Reports,Table Reservation,Payroll', 'Restro360 modules'],
  ['NOT_INTERESTED_REASONS', 'Using other software,Too expensive,No need,Closing / renovating,Owner will decide later,Other', 'Comma separated'],
  ['EXPENSE_CATEGORIES', 'Fuel,Travel,Food,Other', 'Comma separated'],
  ['BROCHURE_URL', '', 'Brochure link (pitch kit + WhatsApp message)'],
  ['DEMO_VIDEO_URL', '', 'Demo video link (pitch kit)'],
  ['PRICE_SHEET_URL', '', 'Price sheet link (pitch kit)'],
  ['WHATSAPP_TEMPLATE', 'Namaste {name}, thank you for your time today. Restro360 brochure: {brochure} - {rep}', 'Placeholders: {name} {rep} {brochure}'],
];

const LOC_FIELDS = ['name', 'type', 'address', 'area', 'pincode', 'lat', 'lng', 'outlets', 'seating', 'cuisine',
  'currentPOS', 'posExpiry', 'ownerName', 'ownerPhone', 'ownerWhatsapp', 'ownerEmail', 'mgrName', 'mgrPhone',
  'mgrWhatsapp', 'mgrEmail', 'cardName', 'cardDesignation', 'cardPhone', 'cardEmail'];
const PHONE_FIELDS = ['ownerPhone', 'ownerWhatsapp', 'mgrPhone', 'mgrWhatsapp', 'cardPhone'];
const EMAIL_FIELDS = ['ownerEmail', 'mgrEmail', 'cardEmail'];

const OUTCOMES = {
  INTERESTED: { status: 'Visited', stage: 'Interested' },
  DEMO: { status: 'Visited', stage: 'Demo' },
  FOLLOWUP: { status: 'Revisit', stage: 'Visited' },
  NOT_INTERESTED: { status: 'Not interested', stage: 'Lost' },
  DM_NA: { status: 'Revisit', stage: 'Visited' },
};
const STAGE_RANK = { '': 0, New: 0, Lost: 1, Visited: 1, Interested: 2, Demo: 3, Closed: 4 };

const ACTIONS = {
  bootstrap: { fn: bootstrap },
  consent: { fn: saveConsent, write: true },
  myDay: { fn: myDay },
  startDay: { fn: startDay, write: true },
  endDay: { fn: endDay, write: true },
  pings: { fn: savePings, write: true },
  geocode: { fn: reverseGeocode },
  ocrCard: { fn: ocrCard },
  checkDuplicate: { fn: checkDuplicate },
  saveVisit: { fn: saveVisit, write: true },
  addExpense: { fn: addExpense, write: true },
  myExpenses: { fn: myExpenses },
  file: { fn: getFile },
  // web panel
  team: { fn: team, roles: PANEL },
  dashboard: { fn: dashboard, roles: PANEL },
  leads: { fn: leads, roles: PANEL },
  leadDetail: { fn: leadDetail, roles: PANEL },
  updateLead: { fn: updateLead, roles: PANEL, write: true },
  planGet: { fn: planGet, roles: PANEL },
  planSave: { fn: planSave, roles: PANEL, write: true },
  replay: { fn: replay, roles: PANEL },
  reports: { fn: reports, roles: PANEL },
  exportData: { fn: exportData, roles: PANEL, write: true },
  duplicates: { fn: duplicates, roles: PANEL },
  resolveDuplicate: { fn: resolveDuplicate, roles: TOP, write: true },
};

let _tables = {}, _settings = null, _book = null, _names = null;

// ======================= ENTRY POINTS =======================

function doGet() {
  return json({ ok: true, app: 'Restro360 Field API', version: VERSION });
}

function doPost(e) {
  _tables = {}; _settings = null; _book = null; _names = null;
  let req = {};
  try {
    req = JSON.parse(e.postData.contents);
    if (req.action === 'ping') return json({ ok: true, version: VERSION, time: Date.now() });
    if (req.action === 'login') return json(login(req.data || {}));
    const user = auth(req.token);
    const route = ACTIONS[req.action];
    if (!route) throw fail('Unknown action: ' + req.action);
    if (route.roles && route.roles.indexOf(user.role) < 0) throw fail('You do not have access to this');
    const data = req.data || {};
    const out = route.write ? withLock(() => route.fn(user, data)) : route.fn(user, data);
    return json(Object.assign({ ok: true }, out));
  } catch (err) {
    console.error(req.action, err && err.stack);
    return json({ ok: false, error: String((err && err.message) || err), code: (err && err.code) || '' });
  }
}

// ======================= AUTH =======================

function login(d) {
  const phone = normPhone(d.phone), pin = String(d.pin || '').trim();
  if (!phone || !pin) throw fail('Enter phone number and PIN');
  return withLock(() => {
    fillIds();
    const U = table('Users');
    const u = U.rows.find(r => normPhone(r.phone) === phone);
    if (!u || !isTrue(u.active)) throw fail('This phone number is not registered or is inactive');
    const role = String(u.role || '').trim().toUpperCase();
    const stored = String(u.pin || '').trim();
    const hashed = 'h:' + sha(u.id + ':' + pin);
    const ok = stored.indexOf('h:') === 0 ? stored === hashed
      : stored === pin || stored.replace(/^0+/, '') === pin.replace(/^0+/, '');
    if (!ok) throw fail('Wrong PIN');
    if (role === 'REP' && u.deviceId && d.deviceId && u.deviceId !== d.deviceId) {
      throw fail('This account is locked to another phone. Ask admin to clear deviceId in the Users sheet.');
    }
    // Reps get a fresh token (one phone); panel users keep theirs so laptop + phone both stay logged in.
    const token = role === 'REP' || !u.token ? Utilities.getUuid() : u.token;
    U.set(u, { pin: hashed, token: token, deviceId: role === 'REP' ? (d.deviceId || '') : u.deviceId,
      forceLogout: 'FALSE', lastSeen: nowStr() });
    U.flush();
    audit(u.id, 'LOGIN', 'User', u.id, String(d.device || '').slice(0, 150));
    u.role = role;
    u.managerId = managerIdOf(u);
    return Object.assign({ ok: true, token: token }, bootstrap(u));
  });
}

function auth(token) {
  if (!token) throw fail('Please login', 'AUTH');
  const U = table('Users');
  const u = U.rows.find(r => r.token && r.token === token);
  if (!u) throw fail('Session expired, please login again', 'AUTH');
  if (!isTrue(u.active)) throw fail('Your account is inactive', 'AUTH');
  if (isTrue(u.forceLogout)) {
    withLock(() => {
      U.set(u, { forceLogout: 'FALSE', token: '', deviceId: '' });
      U.flush();
      audit(u.id, 'REMOTE_LOGOUT', 'User', u.id, 'Device wiped');
    });
    throw fail('You were logged out by admin', 'WIPE');
  }
  u.role = String(u.role || '').trim().toUpperCase();
  u.managerId = managerIdOf(u);
  return u;
}

function managerIdOf(u) {
  const mp = normPhone(u.managerPhone);
  if (!mp) return '';
  const m = table('Users').rows.find(r => normPhone(r.phone) === mp);
  return m ? m.id : '';
}

function teamOf(user) {
  return user.role === 'MANAGER' ? user.id : (user.managerId || '');
}

function bootstrap(user) {
  return {
    user: { id: user.id, name: user.name, phone: user.phone, role: user.role, consented: !!user.consentAt },
    settings: publicSettings(),
    sheetUrl: TOP.indexOf(user.role) >= 0 ? book().getUrl() : '',
    version: VERSION,
  };
}

function saveConsent(user, d) {
  const U = table('Users');
  const u = U.rows.find(r => r.id === user.id);
  U.set(u, { consentAt: nowStr(), consentName: String(d.name || '').slice(0, 80) });
  U.flush();
  audit(user.id, 'CONSENT', 'User', user.id, 'Location tracking consent given by ' + d.name);
  return { consented: true };
}

// ======================= SCOPE (who sees what) =======================

function scope(user) {
  if (TOP.indexOf(user.role) >= 0) return { all: true, reps: {} };
  const reps = {};
  reps[user.id] = true;
  if (user.role === 'MANAGER') {
    const myPhone = normPhone(user.phone);
    table('Users').rows.forEach(r => { if (normPhone(r.managerPhone) === myPhone) reps[r.id] = true; });
  }
  return { all: false, reps: reps };
}

function canSeeRep(sc, repId) { return sc.all || !!sc.reps[repId]; }

function canSeeLoc(user, sc, l) {
  if (sc.all) return true;
  if (user.role === 'REP') return l.assignedRepId === user.id || l.ownerRepId === user.id;
  return l.ownerTeamId === user.id || !!sc.reps[l.assignedRepId] || !!sc.reps[l.ownerRepId];
}

function canSeeVisit(user, sc, v) {
  return sc.all || !!sc.reps[v.repId] || (user.role === 'MANAGER' && v.teamId === user.id);
}

// ======================= REP: DAY, PLAN, ATTENDANCE =======================

function myDay(user, d) {
  const date = d.date || today();
  const tomorrow = fmt(new Date(Date.now() + 864e5), 'yyyy-MM-dd');
  const mine = table('Locations').rows.filter(l => l.id && l.stage !== 'Merged' &&
    (l.assignedRepId === user.id || l.ownerRepId === user.id));
  const planIds = mine.filter(l => l.assignedRepId === user.id && l.planDate === date)
    .sort(byPlanOrder).map(l => l.id);
  const followUpIds = mine.filter(l => !/closed|not interested/i.test(l.status) &&
    ((l.nextFollowUp && l.nextFollowUp.slice(0, 10) <= tomorrow) ||
     (l.demoAt && l.demoAt.slice(0, 10) >= date && l.demoAt.slice(0, 10) <= tomorrow)))
    .map(l => l.id);
  const visits = table('Visits').rows.filter(v => v.repId === user.id && String(v.checkInAt).slice(0, 10) === date);
  const att = table('Attendance').rows.find(a => a.repId === user.id && a.date === date);
  return {
    date: date,
    attendance: att ? clean(att) : null,
    leads: mine.slice(0, 800).map(clean),
    planIds: planIds,
    followUpIds: followUpIds,
    stats: {
      visits: visits.length,
      interested: visits.filter(v => v.outcome === 'INTERESTED' || v.outcome === 'DEMO').length,
      demos: visits.filter(v => v.outcome === 'DEMO').length,
      newLeads: mine.filter(l => l.createdBy === user.id && String(l.createdAt).slice(0, 10) === date).length,
      km: routeKm(trackRows(user.id, date)),
    },
  };
}

function startDay(user, d) {
  const A = table('Attendance');
  const date = fmt(new Date(Number(d.ts) || Date.now()), 'yyyy-MM-dd');
  const existing = A.rows.find(a => a.repId === user.id && a.date === date);
  if (existing) return { attendance: clean(existing) };
  const rec = {
    id: d.id || uid('A'), repId: user.id, date: date, startAt: ts(d.ts || Date.now()),
    startLat: fixed(d.lat), startLng: fixed(d.lng),
    startSelfie: saveFile(d.selfie, 'Selfies', user.name + '_' + date + '_start'),
  };
  A.append([rec]);
  audit(user.id, 'DAY_START', 'Attendance', rec.id, '');
  return { attendance: rec };
}

function endDay(user, d) {
  const A = table('Attendance');
  const date = d.date || fmt(new Date(Number(d.ts) || Date.now()), 'yyyy-MM-dd');
  let row = A.rows.find(a => a.repId === user.id && a.date === date);
  if (!row) {
    A.append([{ id: uid('A'), repId: user.id, date: date }]);
    row = A.rows[A.rows.length - 1];
  }
  if (row.endAt) return { attendance: clean(row) };
  A.set(row, {
    endAt: ts(d.ts || Date.now()), endLat: fixed(d.lat), endLng: fixed(d.lng),
    endSelfie: saveFile(d.selfie, 'Selfies', user.name + '_' + date + '_end'),
    km: String(routeKm(trackRows(user.id, date))),
  });
  A.flush();
  audit(user.id, 'DAY_END', 'Attendance', row.id, row.km + ' km');
  return { attendance: clean(row) };
}

function savePings(user, d) {
  const pts = (d.points || []).filter(p => p && p.lat && p.lng && p.ts);
  if (!pts.length) return { saved: 0 };
  const byMonth = {};
  pts.forEach(p => {
    const k = fmt(new Date(Number(p.ts)), 'yyyy_MM');
    (byMonth[k] = byMonth[k] || []).push({ repId: user.id, ts: ts(p.ts), lat: fixed(p.lat), lng: fixed(p.lng),
      accuracy: Math.round(Number(p.acc) || 0) });
  });
  Object.keys(byMonth).forEach(k => trackTable(k).append(byMonth[k]));
  const last = pts.reduce((a, b) => (Number(b.ts) > Number(a.ts) ? b : a));
  const U = table('Users');
  const u = U.rows.find(r => r.id === user.id);
  U.set(u, { lastLat: fixed(last.lat), lastLng: fixed(last.lng), lastSeen: ts(last.ts) });
  U.flush();
  return { saved: pts.length };
}

// ======================= REP: VISIT CAPTURE =======================

function reverseGeocode(user, d) {
  const res = Maps.newGeocoder().setRegion('in').reverseGeocode(Number(d.lat), Number(d.lng));
  const r = res && res.results && res.results[0];
  if (!r) return { address: '' };
  const part = type => {
    const c = r.address_components.find(x => x.types.indexOf(type) >= 0);
    return c ? c.long_name : '';
  };
  return {
    address: r.formatted_address,
    pincode: part('postal_code'),
    area: part('sublocality_level_1') || part('sublocality') || part('locality'),
  };
}

/** Business card OCR using Google Drive's built-in OCR (free). Needs the "Drive API" advanced service. */
function ocrCard(user, d) {
  if (typeof Drive === 'undefined') {
    throw fail('OCR needs the Drive API service: Apps Script editor > Services (+) > Drive API > Add.');
  }
  const blob = dataUrlToBlob(d.image, 'card');
  const doc = Drive.Files.create({ name: 'ocr_tmp_' + Date.now(), mimeType: MimeType.GOOGLE_DOCS }, blob,
    { ocrLanguage: 'en', fields: 'id' });
  let text = '';
  try {
    text = DocumentApp.openById(doc.id).getBody().getText();
  } finally {
    DriveApp.getFileById(doc.id).setTrashed(true);
  }
  return { text: text, fields: parseCard(text) };
}

function parseCard(text) {
  const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0].toLowerCase();
  const phones = (text.match(/(?:\+?91[\s-]?|0)?[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}/g) || []).map(normPhone).filter(Boolean);
  const desig = /\b(owner|proprietor|founder|co-founder|director|partner|manager|ceo|chef|gm|md|head|executive|incharge|in-charge)\b/i;
  const company = /\b(restaurant|cafe|café|hotel|kitchen|foods?|pvt|ltd|llp|bakery|bakers|sweets|dhaba|caterers|bar|bistro|enterprises)\b/i;
  const designation = lines.find(l => desig.test(l) && l.length < 40) || '';
  const name = lines.find(l => /^[A-Za-z][A-Za-z. ]{2,32}$/.test(l) && l.split(/\s+/).length >= 2 &&
    l.split(/\s+/).length <= 4 && !desig.test(l) && !company.test(l)) || '';
  const address = lines.filter(l => /\b\d{6}\b|\b(road|rd|street|st|nagar|sector|floor|market|lane|marg|colony|near|opp|plot|shop|block|phase)\b/i.test(l))
    .join(', ');
  return { name: name, designation: designation, phone: phones[0] || '', phone2: phones[1] || '', email: email, address: address };
}

function checkDuplicate(user, d) {
  const c = d.location || {};
  const hit = findDuplicate(c, table('Locations').rows, c.id || '', settings(), false);
  if (!hit) return { duplicate: false };
  return { duplicate: true, matchType: hit.type, message: dupMessage(user, hit.loc) };
}

function dupMessage(user, x) {
  if (x.ownerRepId === user.id || x.assignedRepId === user.id) return 'Already in system - this is already your lead (' + x.name + ')';
  if (!x.ownerRepId) return 'Already in system - unassigned lead "' + x.name + '". Your visit will be linked to it.';
  if (x.ownerTeamId && x.ownerTeamId === teamOf(user)) return 'Already in system - owned by ' + (userNames()[x.ownerRepId] || 'a teammate') + ' (your team)';
  return 'Already in system - existing lead, owned by another team';
}

function saveVisit(user, d) {
  const v = d.visit || {}, inLoc = d.location || {}, files = d.files || {};
  if (!v.id) throw fail('Missing visit id');
  const V = table('Visits');
  const done = V.rows.find(r => r.id === v.id);
  if (done) return { visitId: done.id, locationId: done.locationId, repeat: true };

  const S = settings();
  const L = table('Locations');
  const sc = scope(user);
  const team = teamOf(user);
  const date = fmt(new Date(Number(v.checkInAt) || Date.now()), 'yyyy-MM-dd');

  const patch = {};
  LOC_FIELDS.forEach(k => {
    const val = inLoc[k];
    if (val !== undefined && val !== null && String(val).trim() !== '') patch[k] = String(val).trim();
  });
  PHONE_FIELDS.forEach(k => { if (patch[k]) patch[k] = normPhone(patch[k]) || patch[k]; });
  EMAIL_FIELDS.forEach(k => { if (patch[k]) patch[k] = patch[k].toLowerCase(); });

  let loc = v.locationId ? L.rows.find(r => r.id === v.locationId) : null;
  let isNew = false, hit = null, message = '';
  const flags = [];

  if (loc) {
    if (!canSeeLoc(user, sc, loc)) flags.push('NOT_ASSIGNED');
    // Only newly added phones/emails are checked against other leads.
    const fresh = {};
    PHONE_FIELDS.concat(EMAIL_FIELDS).forEach(k => { if (patch[k] && patch[k] !== loc[k]) fresh[k] = patch[k]; });
    if (Object.keys(fresh).length) hit = findDuplicate(fresh, L.rows, loc.id, S, true);
    if (hit && (hit.loc.id === loc.dupOf)) hit = null;
  } else {
    const cand = Object.assign({}, patch);
    if (!cand.lat && v.lat) { cand.lat = v.lat; cand.lng = v.lng; }
    const found = findDuplicate(cand, L.rows, '', S, false);
    if (found && (!found.loc.ownerRepId || found.loc.ownerRepId === user.id || found.loc.assignedRepId === user.id)) {
      loc = found.loc;
      message = 'Already in system - visit linked to existing lead "' + loc.name + '"';
    } else {
      isNew = true;
      hit = found;
      loc = Object.assign({
        id: inLoc.id || uid('L'), source: 'WALK-IN', status: 'Visited', stage: 'Visited',
        assignedRepId: user.id, ownerRepId: user.id, ownerTeamId: team, ownedSince: nowStr(),
        createdBy: user.id, createdAt: nowStr(), dupOf: found ? found.loc.id : '',
      }, cand);
    }
  }

  if (!isNew) { delete patch.lat; delete patch.lng; }

  // ---- files to Drive ----
  const base = (patch.name || loc.name || 'visit') + '_' + date;
  const urls = {
    photoStorefront: saveFile(files.storefront, 'Photos', base + '_storefront'),
    photoInterior: saveFile(files.interior, 'Photos', base + '_interior'),
    photoCounter: saveFile(files.counter, 'Photos', base + '_counter'),
    cardUrl: saveFile(files.card, 'Cards', base + '_card'),
    audioUrl: saveFile(files.audio, 'Audio', base + '_voice'),
  };

  // ---- lead status / stage / ownership ----
  const o = OUTCOMES[v.outcome] || { status: 'Visited', stage: 'Visited' };
  const locPatch = Object.assign({}, patch, {
    status: o.status, lastVisitAt: ts(v.checkInAt), updatedAt: nowStr(),
    nextFollowUp: v.followUpAt || '', demoAt: v.outcome === 'DEMO' ? dt(v.demoAt) : (loc.demoAt || ''),
  });
  if (urls.cardUrl) locPatch.cardUrl = urls.cardUrl;
  if (o.stage === 'Lost' ? loc.stage !== 'Closed' : (STAGE_RANK[o.stage] || 0) >= (STAGE_RANK[loc.stage] || 0)) locPatch.stage = o.stage;
  if (!isNew) {
    if (!loc.lat && v.lat) { locPatch.lat = fixed(v.lat); locPatch.lng = fixed(v.lng); }
    const days = loc.ownedSince ? (Date.now() - parseTs(loc.ownedSince).getTime()) / 864e5 : 9999;
    const protectDays = Number(S.LEAD_PROTECT_DAYS) || 30;
    if (!loc.ownerRepId || (loc.ownerRepId !== user.id && days > protectDays && loc.stage !== 'Closed')) {
      Object.assign(locPatch, { ownerRepId: user.id, ownerTeamId: team, ownedSince: nowStr() });
    }
  }

  // ---- quality score + suspicious-visit flags ----
  const minMin = Number(S.MIN_VISIT_MIN) || 5;
  const durationMin = v.checkOutAt && v.checkInAt ? Math.max(0, Math.round((v.checkOutAt - v.checkInAt) / 60000)) : 0;
  const distanceM = isNew ? 0 : distM(loc.lat, loc.lng, v.lat, v.lng);
  if (durationMin < minMin) flags.push('TOO_SHORT');
  if (!v.lat) flags.push('NO_GPS');
  if (distanceM !== null && distanceM > (Number(S.GEOFENCE_M) || 150)) flags.push('OUTSIDE_GEOFENCE');
  if (Number(v.accuracy) > 200) flags.push('LOW_GPS_ACCURACY');
  const checkIn = ts(v.checkInAt);
  const prev = V.rows.filter(r => r.repId === user.id && String(r.checkInAt).slice(0, 10) === date &&
    r.checkOutAt && r.checkInAt < checkIn).sort((a, b) => a.checkOutAt.localeCompare(b.checkOutAt)).pop();
  if (prev && v.lat && prev.lat) {
    const km = distM(prev.lat, prev.lng, v.lat, v.lng) / 1000;
    const hrs = (Number(v.checkInAt) - parseTs(prev.checkOutAt).getTime()) / 36e5;
    if (km > 1 && hrs > 0 && km / hrs > 80) flags.push('FAST_ROUTE');
  }
  if (hit) flags.push('DUPLICATE');

  const merged = Object.assign({}, loc, locPatch);
  let score = durationMin >= minMin ? 25 : 0;
  score += ['photoStorefront', 'photoInterior', 'photoCounter'].filter(k => urls[k]).length * 10;
  if (urls.cardUrl) score += 10;
  if (merged.ownerPhone || merged.mgrPhone) score += 15;
  if (String(v.remarks || '').trim().length >= 15 || urls.audioUrl) score += 10;
  if (merged.type && merged.currentPOS) score += 10;

  // ---- write ----
  if (isNew) L.append([merged]);
  else { L.set(loc, locPatch); L.flush(); }
  V.append([{
    id: v.id, locationId: loc.id, repId: user.id, teamId: team, checkInAt: checkIn, checkOutAt: ts(v.checkOutAt),
    durationMin: durationMin, lat: fixed(v.lat), lng: fixed(v.lng), accuracy: Math.round(Number(v.accuracy) || 0),
    distanceM: distanceM === null ? '' : distanceM, outcome: v.outcome || '', modules: (v.modules || []).join(', '),
    demoAt: dt(v.demoAt), followUpAt: v.followUpAt || '', notInterestedReason: v.reason || '',
    remarks: String(v.remarks || '').slice(0, 5000), photoStorefront: urls.photoStorefront,
    photoInterior: urls.photoInterior, photoCounter: urls.photoCounter, cardUrl: urls.cardUrl, audioUrl: urls.audioUrl,
    qualityScore: score, flags: flags.join(', '), duplicateOf: hit ? hit.loc.id : '', createdAt: nowStr(),
  }]);
  if (hit) message = recordDuplicate(user, team, isNew ? merged : loc, hit);
  audit(user.id, 'VISIT', 'Location', loc.id, (merged.name || '') + ' / ' + (v.outcome || ''));
  return { visitId: v.id, locationId: loc.id, qualityScore: score, flags: flags, message: message };
}

function findDuplicate(c, rows, excludeId, S, contactsOnly) {
  const radius = Number(S.DUP_RADIUS_M) || 50;
  const phones = PHONE_FIELDS.map(k => normPhone(c[k])).filter(Boolean);
  const emails = EMAIL_FIELDS.map(k => String(c[k] || '').trim().toLowerCase()).filter(Boolean);
  const nm = normName(c.name);
  let byName = null;
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i];
    if (!x.id || x.id === excludeId || x.dupOf || x.stage === 'Merged') continue;
    if (phones.length && PHONE_FIELDS.some(k => { const p = normPhone(x[k]); return p && phones.indexOf(p) >= 0; })) {
      return { loc: x, type: 'PHONE' };
    }
    if (emails.length && EMAIL_FIELDS.some(k => { const m = String(x[k] || '').trim().toLowerCase(); return m && emails.indexOf(m) >= 0; })) {
      return { loc: x, type: 'EMAIL' };
    }
    if (!contactsOnly && !byName && nm && c.lat && x.lat) {
      const dm = distM(c.lat, c.lng, x.lat, x.lng);
      if (dm !== null && dm <= radius && similarity(nm, normName(x.name)) >= 0.7) byName = { loc: x, type: 'NAME_NEARBY' };
    }
  }
  return byName;
}

function recordDuplicate(user, team, newLoc, hit) {
  const D = table('Duplicates');
  const ex = hit.loc;
  if (!D.rows.some(r => r.newLocationId === newLoc.id && r.existingLocationId === ex.id)) {
    D.append([{ id: uid('D'), createdAt: nowStr(), newLocationId: newLoc.id, existingLocationId: ex.id,
      matchType: hit.type, repId: user.id, repTeamId: team, ownerTeamId: ex.ownerTeamId || '', status: 'Open' }]);
    notifyOwnerManager(ex, user);
  }
  return dupMessage(user, ex);
}

function notifyOwnerManager(ex, user) {
  try {
    const mgr = table('Users').rows.find(u => u.id === ex.ownerTeamId);
    if (!mgr || !mgr.email) return;
    MailApp.sendEmail(mgr.email, 'Duplicate lead flagged: ' + ex.name,
      'Hi ' + mgr.name + ',\n\nA rep from another team has also captured your lead "' + ex.name + '" (' +
      (ex.area || ex.address || '') + ').\nCEO/Admin will review it in the Duplicates section of the panel.\n\n- Restro360 Field');
  } catch (e) {
    console.warn('mail failed', e);
  }
}

function addExpense(user, d) {
  const E = table('Expenses');
  if (d.id && E.rows.some(r => r.id === d.id)) return { repeat: true };
  const rec = {
    id: d.id || uid('E'), repId: user.id, date: d.date || today(), category: d.category || '',
    amount: String(Number(d.amount) || 0), note: String(d.note || '').slice(0, 500),
    receiptUrl: saveFile(d.receipt, 'Receipts', user.name + '_' + (d.date || today()) + '_' + (d.category || 'expense')),
    status: 'Submitted', createdAt: nowStr(),
  };
  E.append([rec]);
  audit(user.id, 'EXPENSE', 'Expense', rec.id, rec.category + ' ' + rec.amount);
  return { expense: rec };
}

function myExpenses(user) {
  const rows = table('Expenses').rows.filter(r => r.repId === user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 60);
  return { rows: rows.map(clean) };
}

/** Streams a Drive file (photo/audio) to the app after checking the user may see it. Files stay private. */
function getFile(user, d) {
  const url = String(d.url || '');
  const id = (url.match(/[-\w]{25,}/) || [])[0];
  if (!id) throw fail('Bad file link');
  if (!canSeeFile(user, url)) throw fail('Not allowed');
  const blob = DriveApp.getFileById(id).getBlob();
  return { mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function canSeeFile(user, url) {
  if (TOP.indexOf(user.role) >= 0) return true;
  const sc = scope(user);
  const locs = index(table('Locations').rows, 'id');
  // Visit media is visible to the visiting rep's team and to whoever owns the lead now (after a transfer).
  const hit = (name, fields) => table(name).rows.some(r =>
    fields.some(f => r[f] === url) && (sc.reps[r.repId] || (user.role === 'MANAGER' && r.teamId === user.id) ||
      (r.locationId && locs[r.locationId] && canSeeLoc(user, sc, locs[r.locationId]))));
  return hit('Visits', ['photoStorefront', 'photoInterior', 'photoCounter', 'cardUrl', 'audioUrl']) ||
    hit('Attendance', ['startSelfie', 'endSelfie']) || hit('Expenses', ['receiptUrl']) ||
    table('Locations').rows.some(l => l.cardUrl === url && canSeeLoc(user, sc, l));
}

// ======================= PANEL (Manager / CEO / Admin) =======================

function team(user) {
  const sc = scope(user), names = userNames();
  const reps = table('Users').rows.filter(u => String(u.role).trim().toUpperCase() === 'REP' && isTrue(u.active) && canSeeRep(sc, u.id))
    .map(u => ({ id: u.id, name: u.name, phone: u.phone, manager: names[managerIdOf(u)] || '' }));
  return { reps: reps };
}

function dashboard(user, d) {
  const date = d.date || today();
  const sc = scope(user), names = userNames();
  const reps = team(user).reps;
  const users = index(table('Users').rows, 'id');
  const visits = table('Visits').rows.filter(v => String(v.checkInAt).slice(0, 10) === date && canSeeVisit(user, sc, v));
  const att = table('Attendance').rows.filter(a => a.date === date);
  const locs = table('Locations').rows;
  const byId = index(locs, 'id');
  const positive = visits.filter(v => v.outcome === 'INTERESTED' || v.outcome === 'DEMO').length;
  const minutes = visits.reduce((s, v) => s + (Number(v.durationMin) || 0), 0);
  const due = locs.filter(l => l.id && l.nextFollowUp && l.nextFollowUp.slice(0, 10) <= date &&
    !/closed|not interested/i.test(l.status) && l.stage !== 'Merged' && canSeeLoc(user, sc, l)).length;
  return {
    date: date,
    kpis: {
      visits: visits.length, interested: positive, demos: visits.filter(v => v.outcome === 'DEMO').length,
      conversion: visits.length ? Math.round(positive * 100 / visits.length) : 0,
      avgMin: visits.length ? Math.round(minutes / visits.length) : 0, followUpsDue: due,
      activeReps: reps.filter(r => att.some(a => a.repId === r.id)).length, totalReps: reps.length,
      flagged: visits.filter(v => v.flags).length,
    },
    reps: reps.map(r => {
      const a = att.find(x => x.repId === r.id) || {};
      const u = users[r.id] || {};
      return { id: r.id, name: r.name, phone: r.phone, lastLat: u.lastLat, lastLng: u.lastLng, lastSeen: u.lastSeen,
        started: a.startAt || '', ended: a.endAt || '', visits: visits.filter(v => v.repId === r.id).length };
    }),
    visits: visits.sort((a, b) => a.checkInAt.localeCompare(b.checkInAt)).map(v => ({
      id: v.id, locationId: v.locationId, lat: v.lat, lng: v.lng, time: String(v.checkInAt).slice(11, 16),
      outcome: v.outcome, rep: names[v.repId] || '', place: (byId[v.locationId] || {}).name || '',
      flags: v.flags, score: v.qualityScore,
    })),
  };
}

function leads(user, d) {
  const sc = scope(user), names = userNames();
  const q = String(d.q || '').toLowerCase().trim();
  let rows = table('Locations').rows.filter(l => l.id && l.stage !== 'Merged' && canSeeLoc(user, sc, l));
  if (d.stage) rows = rows.filter(l => (l.stage || 'New') === d.stage);
  if (d.repId) rows = rows.filter(l => l.ownerRepId === d.repId || l.assignedRepId === d.repId);
  if (q) rows = rows.filter(l => [l.name, l.area, l.pincode, l.ownerName, l.ownerPhone, l.address].join(' ').toLowerCase().indexOf(q) >= 0);
  rows.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  return { total: rows.length, rows: rows.slice(0, 500).map(l => leadOut(user, l, names)) };
}

function leadOut(user, l, names) {
  const o = clean(l);
  o.ownerRep = names[l.ownerRepId] || '';
  o.assignedRep = names[l.assignedRepId] || '';
  if (l.dupOf) o.dupNote = TOP.indexOf(user.role) >= 0 ? 'Possible duplicate - see Duplicates' : 'Existing lead, owned by another team';
  return o;
}

function leadDetail(user, d) {
  const sc = scope(user), names = userNames();
  const l = table('Locations').rows.find(r => r.id === d.id);
  if (!l || !canSeeLoc(user, sc, l)) throw fail('Lead not found');
  const visits = table('Visits').rows.filter(v => v.locationId === l.id)
    .sort((a, b) => String(b.checkInAt).localeCompare(String(a.checkInAt)))
    .map(v => Object.assign(clean(v), { rep: names[v.repId] || '' }));
  const history = table('Audit').rows.filter(a => a.entityId === l.id)
    .map(a => ({ ts: a.ts, user: names[a.userId] || a.userId, action: a.action, detail: a.detail })).reverse().slice(0, 50);
  return { lead: leadOut(user, l, names), visits: visits, history: history };
}

function updateLead(user, d) {
  const sc = scope(user);
  const L = table('Locations');
  const l = L.rows.find(r => r.id === d.id);
  if (!l || !canSeeLoc(user, sc, l)) throw fail('Lead not found');
  const patch = { updatedAt: nowStr() };
  if (d.stage !== undefined) {
    patch.stage = d.stage;
    if (d.stage === 'Closed') patch.status = 'Closed';
  }
  if (d.nextFollowUp !== undefined) patch.nextFollowUp = d.nextFollowUp;
  if (d.repId) {
    if (!canSeeRep(sc, d.repId)) throw fail('That rep is not in your team');
    const rep = table('Users').rows.find(u => u.id === d.repId);
    // Manual reassignment overrides lead protection.
    Object.assign(patch, { assignedRepId: d.repId, ownerRepId: d.repId, ownerTeamId: managerIdOf(rep), ownedSince: nowStr() });
  }
  L.set(l, patch);
  L.flush();
  audit(user.id, 'LEAD_UPDATE', 'Location', l.id, JSON.stringify(d));
  return { lead: clean(l) };
}

function planGet(user, d) {
  const sc = scope(user);
  if (!d.repId || !canSeeRep(sc, d.repId)) throw fail('Pick a rep from your team');
  const q = String(d.q || '').toLowerCase().trim();
  const all = table('Locations').rows.filter(l => l.id && l.stage !== 'Merged' && !l.dupOf);
  const planned = all.filter(l => l.assignedRepId === d.repId && l.planDate === d.date).sort(byPlanOrder);
  const candidates = all.filter(l => !(l.assignedRepId === d.repId && l.planDate === d.date) &&
    !/closed|not interested/i.test(l.status) && l.stage !== 'Closed' &&
    (sc.all || !l.assignedRepId || canSeeLoc(user, sc, l)) &&
    (!q || [l.name, l.area, l.pincode, l.address].join(' ').toLowerCase().indexOf(q) >= 0))
    .sort((a, b) => (a.assignedRepId === d.repId ? -1 : 0) - (b.assignedRepId === d.repId ? -1 : 0))
    .slice(0, 400);
  const rep = table('Users').rows.find(u => u.id === d.repId) || {};
  const names = userNames();
  const lite = l => ({ id: l.id, name: l.name, type: l.type, address: l.address, area: l.area, pincode: l.pincode,
    lat: l.lat, lng: l.lng, status: l.status, stage: l.stage, assignedRep: names[l.assignedRepId] || '' });
  return { planned: planned.map(lite), candidates: candidates.map(lite),
    start: rep.lastLat ? { lat: Number(rep.lastLat), lng: Number(rep.lastLng) } : null };
}

function planSave(user, d) {
  const sc = scope(user);
  if (!d.repId || !canSeeRep(sc, d.repId)) throw fail('Pick a rep from your team');
  const ids = d.ids || [];
  const L = table('Locations');
  L.rows.forEach(l => {
    if (l.assignedRepId === d.repId && l.planDate === d.date && ids.indexOf(l.id) < 0) L.set(l, { planDate: '', planOrder: '' });
  });
  let n = 0;
  ids.forEach(id => {
    const l = L.rows.find(x => x.id === id);
    if (!l || !(sc.all || !l.assignedRepId || canSeeLoc(user, sc, l))) return;
    n++;
    L.set(l, { assignedRepId: d.repId, planDate: d.date, planOrder: String(n), status: l.status || 'Pending',
      stage: l.stage || 'New', updatedAt: nowStr() });
  });
  L.flush();
  audit(user.id, 'PLAN', 'Rep', d.repId, d.date + ': ' + n + ' stops');
  return { saved: n };
}

function replay(user, d) {
  const sc = scope(user);
  if (!d.repId || !canSeeRep(sc, d.repId)) throw fail('Pick a rep from your team');
  d.date = d.date || today();
  const pts = trackRows(d.repId, d.date);
  const locs = table('Locations').rows;
  const byId = index(locs, 'id');
  const visits = table('Visits').rows.filter(v => v.repId === d.repId && String(v.checkInAt).slice(0, 10) === d.date)
    .sort((a, b) => a.checkInAt.localeCompare(b.checkInAt))
    .map(v => ({ id: v.id, locationId: v.locationId, place: (byId[v.locationId] || {}).name || '', lat: v.lat, lng: v.lng,
      in: v.checkInAt.slice(11, 16), out: String(v.checkOutAt).slice(11, 16), min: v.durationMin, outcome: v.outcome,
      flags: v.flags, score: v.qualityScore }));
  const planned = locs.filter(l => l.assignedRepId === d.repId && l.planDate === d.date).sort(byPlanOrder)
    .map(l => ({ id: l.id, name: l.name, lat: l.lat, lng: l.lng, order: l.planOrder }));
  const att = table('Attendance').rows.find(a => a.repId === d.repId && a.date === d.date);
  const stops = findStops(pts);
  return {
    points: pts.map(p => [p.lat, p.lng, p.t]), visits: visits, planned: planned,
    attendance: att ? clean(att) : null, km: routeKm(pts), stops: stops,
    idleMin: stops.reduce((s, x) => s + x.min, 0),
  };
}

function reports(user, d) {
  const sc = scope(user), names = userNames();
  const from = d.from || today(), to = d.to || from;
  const inRange = s => { const x = String(s || '').slice(0, 10); return x >= from && x <= to; };
  const visits = table('Visits').rows.filter(v => inRange(v.checkInAt) && canSeeVisit(user, sc, v));
  const byId = index(table('Locations').rows, 'id');
  const blank = () => ({ visits: 0, interested: 0, demos: 0, notInterested: 0, followUps: 0, minutes: 0, score: 0, flagged: 0, km: 0 });
  const perRep = {}, perArea = {};
  visits.forEach(v => {
    const r = perRep[v.repId] = perRep[v.repId] || Object.assign({ name: names[v.repId] || v.repId }, blank());
    const l = byId[v.locationId] || {};
    const key = l.area || l.pincode || 'Unknown';
    const a = perArea[key] = perArea[key] || Object.assign({ area: key }, blank());
    [r, a].forEach(x => {
      x.visits++;
      if (v.outcome === 'INTERESTED' || v.outcome === 'DEMO') x.interested++;
      if (v.outcome === 'DEMO') x.demos++;
      if (v.outcome === 'NOT_INTERESTED') x.notInterested++;
      if (v.outcome === 'FOLLOWUP' || v.outcome === 'DM_NA') x.followUps++;
      x.minutes += Number(v.durationMin) || 0;
      x.score += Number(v.qualityScore) || 0;
      if (v.flags) x.flagged++;
    });
  });
  table('Attendance').rows.forEach(a => {
    if (!inRange(a.date) || !canSeeRep(sc, a.repId)) return;
    const r = perRep[a.repId] = perRep[a.repId] || Object.assign({ name: names[a.repId] || a.repId }, blank());
    r.km += Number(a.km) || 0;
  });
  const finish = x => Object.assign(x, { avgMin: x.visits ? Math.round(x.minutes / x.visits) : 0,
    avgScore: x.visits ? Math.round(x.score / x.visits) : 0, km: Math.round(x.km * 10) / 10 });
  const uniq = {};
  visits.forEach(v => { uniq[v.locationId] = byId[v.locationId] || {}; });
  const stages = Object.keys(uniq).map(k => uniq[k].stage || '');
  return {
    from: from, to: to,
    perRep: Object.keys(perRep).map(k => finish(perRep[k])).sort((a, b) => b.visits - a.visits),
    perArea: Object.keys(perArea).map(k => finish(perArea[k])).sort((a, b) => b.visits - a.visits),
    funnel: {
      visited: stages.length,
      interested: stages.filter(s => ['Interested', 'Demo', 'Closed'].indexOf(s) >= 0).length,
      demo: stages.filter(s => ['Demo', 'Closed'].indexOf(s) >= 0).length,
      closed: stages.filter(s => s === 'Closed').length,
    },
  };
}

function exportData(user, d) {
  const sc = scope(user), names = userNames();
  const from = d.from || '0000', to = d.to || '9999';
  const inRange = s => { const x = String(s || '').slice(0, 10); return x >= from && x <= to; };
  const byId = index(table('Locations').rows, 'id');
  let headers, rows;
  if (d.type === 'leads') {
    headers = ['Name', 'Type', 'Area', 'Pincode', 'Address', 'Stage', 'Status', 'Owner', 'Owner phone', 'Owner email',
      'Manager/IT', 'Manager phone', 'Current POS', 'POS expiry', 'Rep', 'Last visit', 'Next follow-up'];
    rows = table('Locations').rows.filter(l => l.id && l.stage !== 'Merged' && canSeeLoc(user, sc, l) &&
      (!d.from || inRange(l.lastVisitAt || l.createdAt)))
      .map(l => [l.name, l.type, l.area, l.pincode, l.address, l.stage, l.status, l.ownerName, l.ownerPhone, l.ownerEmail,
        l.mgrName, l.mgrPhone, l.currentPOS, l.posExpiry, names[l.ownerRepId] || '', l.lastVisitAt, l.nextFollowUp]);
  } else {
    headers = ['Check-in', 'Check-out', 'Minutes', 'Rep', 'Restaurant', 'Area', 'Outcome', 'Modules', 'Demo at',
      'Follow-up', 'Reason', 'Quality score', 'Flags', 'Remarks'];
    rows = table('Visits').rows.filter(v => inRange(v.checkInAt) && canSeeVisit(user, sc, v))
      .map(v => {
        const l = byId[v.locationId] || {};
        return [v.checkInAt, v.checkOutAt, v.durationMin, names[v.repId] || '', l.name || '', l.area || '', v.outcome,
          v.modules, v.demoAt, v.followUpAt, v.notInterestedReason, v.qualityScore, v.flags, v.remarks];
      });
  }
  const limit = user.role === 'MANAGER' ? (Number(settings().EXPORT_LIMIT_MANAGER) || 1000) : Infinity;
  const truncated = rows.length > limit;
  if (truncated) rows = rows.slice(0, limit);
  audit(user.id, 'EXPORT', d.type || 'visits', '', rows.length + ' rows ' + from + '..' + to);
  return { headers: headers, rows: rows, truncated: truncated };
}

function duplicates(user) {
  const top = TOP.indexOf(user.role) >= 0, names = userNames();
  const byId = index(table('Locations').rows, 'id');
  const card = l => l && l.id ? { id: l.id, name: l.name, address: l.address, area: l.area, ownerName: l.ownerName,
    ownerPhone: l.ownerPhone, stage: l.stage, rep: names[l.ownerRepId] || '', createdAt: l.createdAt, lastVisitAt: l.lastVisitAt } : null;
  const rows = table('Duplicates').rows.filter(r => top || r.repTeamId === user.id || r.ownerTeamId === user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200)
    .map(r => {
      const base = { id: r.id, createdAt: r.createdAt, status: r.status, matchType: r.matchType };
      const n = byId[r.newLocationId], e = byId[r.existingLocationId];
      if (top || (r.repTeamId === user.id && r.ownerTeamId === user.id)) {
        return Object.assign(base, { rep: names[r.repId] || '', newLoc: card(n), existing: card(e) });
      }
      if (r.repTeamId === user.id) return Object.assign(base, { newLoc: card(n), existing: null, note: 'Existing lead, owned by another team' });
      return Object.assign(base, { newLoc: null, existing: card(e), note: 'A rep from another team also captured this lead' });
    });
  return { rows: rows, canResolve: top };
}

function resolveDuplicate(user, d) {
  const D = table('Duplicates');
  const r = D.rows.find(x => x.id === d.id);
  if (!r || r.status !== 'Open') throw fail('Already resolved');
  const L = table('Locations');
  const n = L.rows.find(x => x.id === r.newLocationId), e = L.rows.find(x => x.id === r.existingLocationId);
  if (!n || !e) throw fail('One of the records is missing');
  let status;
  if (d.action === 'dismiss') {
    L.set(n, { dupOf: '', updatedAt: nowStr() });
    status = 'Not duplicate';
  } else {
    const patch = { updatedAt: nowStr() };
    LOC_FIELDS.forEach(k => { if (!e[k] && n[k]) patch[k] = n[k]; });
    if ((STAGE_RANK[n.stage] || 0) > (STAGE_RANK[e.stage] || 0)) patch.stage = n.stage;
    if (String(n.lastVisitAt) > String(e.lastVisitAt)) {
      Object.assign(patch, { lastVisitAt: n.lastVisitAt, status: n.status, nextFollowUp: n.nextFollowUp });
    }
    if (d.action === 'transfer') {
      Object.assign(patch, { ownerRepId: n.ownerRepId, ownerTeamId: n.ownerTeamId, assignedRepId: n.ownerRepId, ownedSince: nowStr() });
    }
    const V = table('Visits');
    V.rows.forEach(v => { if (v.locationId === n.id) V.set(v, { locationId: e.id }); });
    V.flush();
    L.set(e, patch);
    L.set(n, { stage: 'Merged', status: 'Closed', dupOf: e.id, planDate: '', updatedAt: nowStr() });
    status = d.action === 'transfer' ? 'Merged - moved to new rep' : 'Merged - kept with owner';
  }
  L.flush();
  D.set(r, { status: status, resolvedBy: user.id, resolvedAt: nowStr() });
  D.flush();
  audit(user.id, 'DUPLICATE_RESOLVE', 'Location', e.id, status + ' (' + n.id + ')');
  return { status: status };
}

// ======================= ROUTE MATHS =======================

function trackTable(monthKey) {
  const name = 'Track_' + monthKey;
  if (!book().getSheetByName(name)) ensureSheet(book(), name, TRACK_HEADERS);
  return table(name);
}

function trackRows(repId, date) {
  const name = 'Track_' + date.slice(0, 4) + '_' + date.slice(5, 7);
  if (!book().getSheetByName(name)) return [];
  return table(name).rows.filter(r => r.repId === repId && String(r.ts).slice(0, 10) === date)
    .map(r => ({ t: parseTs(r.ts).getTime(), lat: Number(r.lat), lng: Number(r.lng), acc: Number(r.accuracy) || 0 }))
    .filter(p => p.lat && p.lng)
    .sort((a, b) => a.t - b.t);
}

function routeKm(pts) {
  let m = 0, anchor = null;
  pts.forEach(p => {
    if (p.acc > 100) return;
    if (!anchor) { anchor = p; return; }
    const dm = distM(anchor.lat, anchor.lng, p.lat, p.lng);
    const hrs = (p.t - anchor.t) / 36e5;
    if (dm >= 50 && (hrs <= 0 || dm / 1000 / hrs < 150)) { m += dm; anchor = p; }
  });
  return Math.round(m / 100) / 10;
}

function findStops(pts) {
  const out = [];
  let i = 0;
  while (i < pts.length) {
    let j = i + 1;
    while (j < pts.length && distM(pts[i].lat, pts[i].lng, pts[j].lat, pts[j].lng) <= 100) j++;
    const min = (pts[j - 1].t - pts[i].t) / 60000;
    if (min >= 10) out.push({ lat: pts[i].lat, lng: pts[i].lng, from: fmt(new Date(pts[i].t), 'HH:mm'),
      to: fmt(new Date(pts[j - 1].t), 'HH:mm'), min: Math.round(min) });
    i = j;
  }
  return out;
}

function distM(a1, o1, a2, o2) {
  a1 = Number(a1); o1 = Number(o1); a2 = Number(a2); o2 = Number(o2);
  if (!a1 || !o1 || !a2 || !o2) return null;
  const r = Math.PI / 180;
  const h = Math.pow(Math.sin((a2 - a1) * r / 2), 2) +
    Math.cos(a1 * r) * Math.cos(a2 * r) * Math.pow(Math.sin((o2 - o1) * r / 2), 2);
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

function normName(s) {
  const a = String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const b = a.replace(/\b(the|restaurant|restro|resto|cafe|hotel|family|pure|veg|kitchen|foods?|pvt|ltd|private|limited|and|dhaba|bar|bakery|sweets?)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return b || a;
}

/** Dice similarity on character bigrams (0..1). */
function similarity(a, b) {
  const A = String(a).replace(/\s/g, ''), B = String(b).replace(/\s/g, '');
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.length >= 4 && B.length >= 4 && (A.indexOf(B) >= 0 || B.indexOf(A) >= 0)) return 0.9;
  const grams = s => { const g = {}; for (let i = 0; i < s.length - 1; i++) { const k = s.substr(i, 2); g[k] = (g[k] || 0) + 1; } return g; };
  const ga = grams(A), gb = grams(B);
  let inter = 0, total = 0;
  Object.keys(ga).forEach(k => { total += ga[k]; if (gb[k]) inter += Math.min(ga[k], gb[k]); });
  Object.keys(gb).forEach(k => { total += gb[k]; });
  return total ? 2 * inter / total : 0;
}

// ======================= SHEET "DATABASE" HELPERS =======================

function book() {
  if (_book) return _book;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  _book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return _book;
}

function sheet(name) {
  const sh = book().getSheetByName(name);
  if (!sh) throw fail('Sheet "' + name + '" is missing. Open the Google Sheet and run Restro360 > Setup.');
  return sh;
}

/** Loads a whole tab as objects. set() + flush() write back only the touched rows; append() adds rows. */
function table(name) {
  if (_tables[name]) return _tables[name];
  const sh = sheet(name);
  const lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const values = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  const rows = values.map((r, i) => toObj(headers, r, i));
  const dirty = {};
  const t = {
    sh: sh, headers: headers, rows: rows,
    set: function (row, patch) {
      Object.keys(patch).forEach(k => {
        const j = headers.indexOf(k);
        if (j < 0) return;
        const v = cellVal(patch[k]);
        row[k] = v;
        values[row._i][j] = v;
      });
      dirty[row._i] = true;
    },
    flush: function () {
      const idx = Object.keys(dirty).map(Number).sort((a, b) => a - b);
      idx.forEach(k => delete dirty[k]);
      let i = 0;
      while (i < idx.length) {
        let j = i;
        while (j + 1 < idx.length && idx[j + 1] - idx[j] <= 10) j++;
        sh.getRange(idx[i] + 2, 1, idx[j] - idx[i] + 1, lastCol).setValues(values.slice(idx[i], idx[j] + 1));
        i = j + 1;
      }
    },
    append: function (objs) {
      if (!objs.length) return;
      const arr = objs.map(o => headers.map(h => cellVal(o[h])));
      const start = sh.getLastRow() + 1;
      const extra = start + arr.length - 1 - sh.getMaxRows();
      if (extra > 0) sh.insertRowsAfter(sh.getMaxRows(), extra + 200);
      sh.getRange(start, 1, arr.length, lastCol).setNumberFormat('@').setValues(arr);
      arr.forEach(r => { values.push(r); rows.push(toObj(headers, r, values.length - 1)); });
    },
  };
  _tables[name] = t;
  return t;
}

function toObj(headers, r, i) {
  const o = { _i: i };
  headers.forEach((h, j) => { if (h) o[h] = norm(r[j]); });
  return o;
}

function norm(v) {
  if (v instanceof Date) return fmt(v, 'HH:mm:ss') === '00:00:00' ? fmt(v, 'yyyy-MM-dd') : fmt(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v === null || v === undefined) return '';
  return typeof v === 'number' ? String(v) : v;
}

function cellVal(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function clean(o) {
  const c = {};
  Object.keys(o).forEach(k => { if (k !== '_i') c[k] = o[k]; });
  return c;
}

function index(rows, key) {
  const m = {};
  rows.forEach(r => { if (r[key]) m[r[key]] = r; });
  return m;
}

function userNames() {
  if (_names) return _names;
  _names = {};
  table('Users').rows.forEach(u => { if (u.id) _names[u.id] = u.name; });
  return _names;
}

function settings() {
  if (_settings) return _settings;
  const s = {};
  DEFAULT_SETTINGS.forEach(r => { s[r[0]] = r[1]; });
  table('Settings').rows.forEach(r => { if (r.key) s[String(r.key).trim()] = String(r.value).trim(); });
  _settings = s;
  return s;
}

function publicSettings() {
  const s = settings();
  const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    company: s.COMPANY, geofenceM: Number(s.GEOFENCE_M) || 150, minVisitMin: Number(s.MIN_VISIT_MIN) || 5,
    dailyCapacity: Number(s.DAILY_CAPACITY) || 12, pingIntervalSec: Number(s.PING_INTERVAL_SEC) || 120,
    businessTypes: list(s.BUSINESS_TYPES), modules: list(s.MODULES), reasons: list(s.NOT_INTERESTED_REASONS),
    expenseCategories: list(s.EXPENSE_CATEGORIES), brochureUrl: s.BROCHURE_URL, demoVideoUrl: s.DEMO_VIDEO_URL,
    priceSheetUrl: s.PRICE_SHEET_URL, whatsappTemplate: s.WHATSAPP_TEMPLATE,
  };
}

function audit(userId, action, entity, entityId, detail) {
  table('Audit').append([{ ts: nowStr(), userId: userId, action: action, entity: entity, entityId: entityId || '',
    detail: String(detail || '').slice(0, 500) }]);
}

// ======================= DRIVE =======================

function rootFolder() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  const f = DriveApp.createFolder('Restro360 Field Data');
  props.setProperty('ROOT_FOLDER_ID', f.getId());
  return f;
}

function folder(name) {
  const props = PropertiesService.getScriptProperties();
  const key = 'FOLDER_' + name;
  const id = props.getProperty(key);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted - recreate */ }
  }
  const f = rootFolder().createFolder(name);
  props.setProperty(key, f.getId());
  return f;
}

/** Saves a data: URL to Drive and returns the file link. Non data: values (already a link) pass through. */
function saveFile(dataUrl, folderName, baseName) {
  if (!dataUrl) return '';
  if (String(dataUrl).indexOf('data:') !== 0) return String(dataUrl);
  const blob = dataUrlToBlob(dataUrl, baseName);
  return folder(folderName).createFile(blob).getUrl();
}

function dataUrlToBlob(dataUrl, baseName) {
  const m = String(dataUrl || '').match(/^data:([^;,]+)[^,]*;base64,(.*)$/);
  if (!m) throw fail('Bad file data');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' }[m[1]] || 'bin';
  const name = String(baseName || 'file').replace(/[^\w\- ]+/g, '').slice(0, 80) + '.' + ext;
  return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name);
}

// ======================= SMALL UTILS =======================

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function fail(msg, code) {
  const e = new Error(msg);
  e.code = code || '';
  return e;
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function isTrue(v) { return v === true || /^(true|yes|y|1)$/i.test(String(v).trim()); }
function normPhone(v) { const d = String(v || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }
function uid(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function fixed(n) { return n === undefined || n === null || n === '' ? '' : Number(n).toFixed(6); }
function fmt(d, f) { return Utilities.formatDate(d, TZ, f || 'yyyy-MM-dd HH:mm:ss'); }
function nowStr() { return fmt(new Date()); }
function today() { return fmt(new Date(), 'yyyy-MM-dd'); }
function ts(ms) { return ms ? fmt(new Date(Number(ms))) : ''; }
function dt(local) { return local ? String(local).replace('T', ' ').slice(0, 16) : ''; }
function byPlanOrder(a, b) { return (Number(a.planOrder) || 999) - (Number(b.planOrder) || 999); }

/** Parses "yyyy-MM-dd HH:mm:ss" written in IST back to a Date. */
function parseTs(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return new Date(0);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], (+m[4] || 0) - 5, (+m[5] || 0) - 30, +m[6] || 0));
}

function sha(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

// ======================= SHEET MENU & SETUP =======================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Restro360')
    .addItem('Setup / repair sheets', 'setup')
    .addItem('Fill missing lat/lng from address', 'geocodeMissing')
    .addItem('Generate IDs for new rows', 'fillIdsMenu')
    .addToUi();
}

/** Auto-fills id + defaults when rows are typed or pasted into Users / Locations. */
function onEdit(e) {
  if (!e || !e.range) return;
  const name = e.range.getSheet().getName();
  if (name !== 'Users' && name !== 'Locations') return;
  _book = e.source;
  _tables = {};
  fillIds();
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _book = ss;
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(SCHEMA).forEach(name => ensureSheet(ss, name, SCHEMA[name]));

  const st = ss.getSheetByName('Settings');
  const have = st.getDataRange().getValues().map(r => String(r[0]));
  const add = DEFAULT_SETTINGS.filter(r => have.indexOf(r[0]) < 0);
  if (add.length) st.getRange(st.getLastRow() + 1, 1, add.length, 3).setValues(add);

  const us = ss.getSheetByName('Users');
  if (us.getLastRow() < 2) {
    const admin = { id: 'U-ADMIN', name: 'Admin', phone: '9999999999', role: 'ADMIN', pin: '1234', active: 'TRUE', createdAt: nowStr() };
    us.getRange(2, 1, 1, SCHEMA.Users.length).setValues([SCHEMA.Users.map(h => admin[h] || '')]);
  }
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0) ss.deleteSheet(blank);
  rootFolder();
  _tables = {};
  fillIds();
  try {
    SpreadsheetApp.getUi().alert('Restro360 setup done.\n\nDefault admin login: 9999999999 / PIN 1234 (change it in the Users sheet).\nNext: Deploy > New deployment > Web app.');
  } catch (e) {
    console.log('Setup done');
  }
}

function ensureSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  const isNew = !sh;
  if (isNew) sh = ss.insertSheet(name);
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const used = current.filter(Boolean).length ? current.length : 0;
  const missing = headers.filter(h => current.indexOf(h) < 0);
  if (missing.length) sh.getRange(1, used + 1, 1, missing.length).setValues([missing]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  // Plain-text format keeps phones, PINs and dates exactly as typed.
  if (isNew) sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
  return sh;
}

function fillIdsMenu() {
  fillIds();
  SpreadsheetApp.getActive().toast('IDs generated');
}

function fillIds() {
  ['Users', 'Locations'].forEach(name => {
    if (!book().getSheetByName(name)) return;
    const T = table(name);
    T.rows.forEach(r => {
      if (r.id || !r.name) return;
      const patch = { id: uid(name === 'Users' ? 'U' : 'L'), createdAt: r.createdAt || nowStr() };
      if (name === 'Users' && r.active === '') patch.active = 'TRUE';
      if (name === 'Locations') Object.assign(patch, { status: r.status || 'Pending', stage: r.stage || 'New', source: r.source || 'SHEET' });
      T.set(r, patch);
    });
    T.flush();
  });
}

/** Menu: geocode Locations that have an address but no lat/lng (Apps Script Maps service, free quota). */
function geocodeMissing() {
  _book = SpreadsheetApp.getActiveSpreadsheet();
  const L = table('Locations');
  const geo = Maps.newGeocoder().setRegion('in');
  let done = 0, failed = 0;
  L.rows.forEach(l => {
    if (done + failed >= 200 || l.lat || !(l.address || l.name)) return;
    try {
      const q = [l.name, l.address, l.area, l.pincode, 'India'].filter(Boolean).join(', ');
      const r = geo.geocode(q).results[0];
      if (!r) { failed++; return; }
      const pin = (r.address_components.find(c => c.types.indexOf('postal_code') >= 0) || {}).long_name || '';
      L.set(l, { lat: r.geometry.location.lat.toFixed(6), lng: r.geometry.location.lng.toFixed(6), pincode: l.pincode || pin });
      done++;
    } catch (e) {
      failed++;
    }
  });
  L.flush();
  SpreadsheetApp.getActive().toast('Geocoded ' + done + ' locations' + (failed ? ', ' + failed + ' not found' : ''));
}
