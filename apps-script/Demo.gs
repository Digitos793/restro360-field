/**
 * Restro360 Field — demo data + live self-test (optional file).
 * 1. Run seedDemo()  → adds demo users + 10 demo restaurants (Pune)
 * 2. Run liveTest()  → runs the full app flow on the real Sheet/Drive and logs ok/FAIL lines
 * 3. Run clearDemo() → removes demo users, demo restaurants and their visits when you go live
 * Demo logins (phone / PIN) are in DEMO_USERS below and in the Users sheet.
 */

const DEMO_USERS = [
  { name: 'Demo CEO', phone: '9000000099', role: 'CEO', pin: '9999' },
  { name: 'Demo Manager Priya', phone: '9000000001', role: 'MANAGER', pin: '1111' },
  { name: 'Demo Manager Arjun', phone: '9000000002', role: 'MANAGER', pin: '2222' },
  { name: 'Demo Rep Rahul', phone: '9000000011', role: 'REP', pin: '1234', managerPhone: '9000000001' },
  { name: 'Demo Rep Amit', phone: '9000000012', role: 'REP', pin: '1234', managerPhone: '9000000001' },
  { name: 'Demo Rep Sana', phone: '9000000021', role: 'REP', pin: '1234', managerPhone: '9000000002' },
];

const DEMO_PLACES = [
  ['Spice Garden', 'Restaurant', '12 FC Road', 'Shivajinagar', '411005', 18.5236, 73.8412, 'Rakesh Kulkarni', '9820000010'],
  ['Cafe Mocha Bean', 'Cafe', 'JM Road', 'Deccan', '411004', 18.5195, 73.8455, 'Neha Shah', '9820000011'],
  ['Biryani Junction', 'QSR', 'MG Road, Camp', 'Camp', '411001', 18.5167, 73.8786, '', ''],
  ['Green Leaf Veg', 'Restaurant', 'Paud Road', 'Kothrud', '411038', 18.5074, 73.8077, 'Suresh Patil', '9820000013'],
  ['Tandoor Nights', 'Restaurant', 'Lane 5, Koregaon Park', 'Koregaon Park', '411001', 18.5362, 73.894, '', ''],
  ['Bake Stories', 'Bakery', 'ITI Road', 'Aundh', '411007', 18.559, 73.8075, 'Farah Khan', '9820000015'],
  ['Wok Express', 'Cloud Kitchen', 'Nagar Road', 'Viman Nagar', '411014', 18.5679, 73.9143, '', ''],
  ['Chai Point Corner', 'Cafe', 'Baner Road', 'Baner', '411045', 18.559, 73.7868, '', ''],
  ['Coastal Curry', 'Restaurant', 'Kalyani Nagar', 'Kalyani Nagar', '411006', 18.5463, 73.9033, 'Joseph D', '9820000018'],
  ['Pizza Hub', 'QSR', 'Phase 1, Hinjewadi', 'Hinjewadi', '411057', 18.5913, 73.7389, '', ''],
];

const DEMO_CARD = 'data:image/png;base64,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';

function seedDemo() {
  _book = SpreadsheetApp.getActiveSpreadsheet();
  _tables = {};
  const U = table('Users');
  const have = {};
  U.rows.forEach(u => { have[normPhone(u.phone)] = true; });
  U.append(DEMO_USERS.filter(u => !have[u.phone]).map(u => Object.assign({ id: uid('U'), active: 'TRUE', createdAt: nowStr() }, u)));
  const rahul = U.rows.find(u => normPhone(u.phone) === '9000000011');
  const L = table('Locations');
  const names = {};
  L.rows.forEach(l => { names[l.name] = true; });
  const rows = DEMO_PLACES.filter(p => !names[p[0]]).map((p, i) => {
    const o = { id: uid('L'), name: p[0], type: p[1], address: p[2], area: p[3], pincode: p[4], lat: p[5].toFixed(6), lng: p[6].toFixed(6),
      ownerName: p[7], ownerPhone: p[8], status: 'Pending', stage: 'New', source: 'DEMO', createdAt: nowStr() };
    if (i < 4) Object.assign(o, { assignedRepId: rahul.id, planDate: today(), planOrder: String(i + 1) });
    return o;
  });
  L.append(rows);
  console.log('Demo data added: ' + DEMO_USERS.length + ' users (skipped existing), ' + rows.length + ' restaurants');
}

function liveTest() {
  _book = SpreadsheetApp.getActiveSpreadsheet();
  const out = [];
  let failed = 0;
  const check = (name, cond, extra) => {
    if (!cond) failed++;
    out.push((cond ? 'ok    ' : 'FAIL  ') + name + (cond ? '' : '  ' + JSON.stringify(extra).slice(0, 300)));
  };
  const call = (action, data, token) => JSON.parse(doPost({ postData: { contents: JSON.stringify({ action: action, data: data, token: token }) } }).getContent());
  const pinOf = phone => DEMO_USERS.find(u => u.phone === phone).pin;
  const login = phone => call('login', { phone: phone, pin: pinOf(phone), deviceId: 'LIVETEST' });
  const now = Date.now();
  const date = today();
  const place = name => { _tables = {}; return table('Locations').rows.find(l => l.name === name); };

  try {
    check('ping', call('ping').ok);
    const rr = login('9000000011');
    check('rep login', rr.ok && rr.user.role === 'REP', rr);
    const R = rr.token;
    check('consent', call('consent', { name: 'Demo Rep Rahul' }, R).ok);
    const sd = call('startDay', { id: uid('A'), ts: now - 2 * 3600e3, lat: 18.5230, lng: 73.8400, selfie: DEMO_CARD }, R);
    check('start day + selfie saved to Drive', sd.ok && /drive\.google\.com/.test(sd.attendance.startSelfie), sd);
    const pts = [];
    for (let i = 0; i < 10; i++) pts.push({ ts: now - 2 * 3600e3 + i * 4 * 60e3, lat: 18.5230 + i * 0.0006, lng: 73.8400 + i * 0.0003, acc: 12 });
    check('GPS pings', call('pings', { points: pts }, R).saved === 10);
    const geo = call('geocode', { lat: 18.5236, lng: 73.8412 }, R);
    check('address from GPS (Maps geocoder)', geo.ok && geo.address.length > 5, geo);
    const ocr = call('ocrCard', { image: DEMO_CARD }, R);
    check('business card OCR (Drive)', ocr.ok && (ocr.fields.phone === '9820000010' || ocr.fields.email === 'rakesh@spicegarden.in'), ocr);

    const day = call('myDay', { date: date }, R);
    check('rep plan loaded', day.ok && day.planIds.length >= 4, day.planIds);
    const sg = place('Spice Garden');
    const v1 = call('saveVisit', {
      visit: { id: uid('V'), locationId: sg.id, checkInAt: now - 50 * 60e3, checkOutAt: now - 32 * 60e3, lat: 18.52362, lng: 73.84118, accuracy: 15,
        outcome: 'DEMO', modules: ['Billing / POS', 'KOT'], demoAt: date + 'T16:00', remarks: 'Owner wants KOT + inventory. Using manual billing.' },
      location: { id: sg.id, name: 'Spice Garden', currentPOS: 'None / manual billing', seating: '60', cuisine: 'North Indian', cardName: ocr.fields && ocr.fields.name },
      files: { storefront: DEMO_CARD, interior: DEMO_CARD, counter: DEMO_CARD, card: DEMO_CARD },
    }, R);
    check('planned visit saved (photos + card in Drive)', v1.ok && v1.qualityScore >= 80 && v1.flags.indexOf('OUTSIDE_GEOFENCE') < 0, v1);
    check('lead moved to Demo stage', place('Spice Garden').stage === 'Demo');
    const cm = place('Cafe Mocha Bean');
    const v2 = call('saveVisit', {
      visit: { id: uid('V'), locationId: cm.id, checkInAt: now - 25 * 60e3, checkOutAt: now - 10 * 60e3, lat: 18.51953, lng: 73.84548, accuracy: 20,
        outcome: 'INTERESTED', modules: ['Online Orders'], remarks: 'Interested in online orders, call next week' },
      location: { id: cm.id, name: 'Cafe Mocha Bean' }, files: {},
    }, R);
    check('second visit saved', v2.ok, v2);

    const sr = login('9000000021');
    const S2 = sr.token;
    const dc = call('checkDuplicate', { location: { name: 'Spice Garden Family Restaurant', lat: 18.52363, lng: 73.84123 } }, S2);
    check('other team sees masked "Already in system"', dc.duplicate && /another team/.test(dc.message), dc);
    const v3 = call('saveVisit', {
      visit: { id: uid('V'), locationId: '', checkInAt: now - 20 * 60e3, checkOutAt: now - 8 * 60e3, lat: 18.52363, lng: 73.84123, accuracy: 18, outcome: 'FOLLOWUP', followUpAt: date },
      location: { id: uid('L'), name: 'Spice Garden Family Restaurant', type: 'Restaurant', ownerPhone: '9820000099' }, files: {},
    }, S2);
    check('cross-team walk-in flagged as duplicate', v3.ok && v3.flags.indexOf('DUPLICATE') >= 0, v3);

    const M1 = login('9000000001').token, M2 = login('9000000002').token, C = login('9000000099').token;
    const d1 = call('dashboard', { date: date }, M1);
    check('manager dashboard (own team only)', d1.ok && d1.kpis.visits >= 2 && d1.reps.every(r => r.name.indexOf('Sana') < 0), d1.kpis);
    const l2 = call('leads', {}, M2);
    check('other manager sees masked duplicate, not team 1 leads', l2.ok && l2.rows.every(l => l.name !== 'Spice Garden') && l2.rows.some(l => l.dupNote), l2.rows && l2.rows.map(l => l.name));
    const dups = call('duplicates', {}, C);
    const open = dups.rows.filter(r => r.status === 'Open');
    check('CEO sees both records', dups.ok && open.length >= 1 && open[0].newLoc && open[0].existing, dups.rows && dups.rows.length);
    if (open.length) check('CEO merges duplicate', call('resolveDuplicate', { id: open[0].id, action: 'keep' }, C).ok);

    const amit = call('team', {}, M1).reps.find(r => r.name === 'Demo Rep Amit');
    const pg = call('planGet', { repId: amit.id, date: date }, M1);
    const ids = pg.candidates.filter(c => ['Tandoor Nights', 'Bake Stories', 'Wok Express'].indexOf(c.name) >= 0).map(c => c.id);
    check('plan published for Amit', call('planSave', { repId: amit.id, date: date, ids: ids }, M1).saved === ids.length && ids.length === 3, pg.candidates.length);
    const rp = call('replay', { repId: rr.user.id, date: date }, M1);
    check('route replay', rp.ok && rp.points.length === 10 && rp.visits.length >= 2, { km: rp.km, pts: rp.points && rp.points.length });
    const rep = call('reports', { from: date, to: date }, C);
    check('reports + funnel', rep.ok && rep.funnel.visited >= 2, rep.funnel);
    const ex = call('exportData', { type: 'visits', from: date, to: date }, M1);
    check('export', ex.ok && ex.rows.length >= 2, ex.rows && ex.rows.length);
    _tables = {};
    const photo = table('Visits').rows.filter(v => v.photoStorefront).pop();
    const f = call('file', { url: photo.photoStorefront }, M1);
    check('manager can view visit photo', f.ok && f.mime === 'image/png', f.error);
    check('other team blocked from photo', !call('file', { url: photo.photoStorefront }, M2).ok);
    const ed = call('endDay', { date: date, ts: now, lat: 18.53, lng: 73.845, selfie: DEMO_CARD }, R);
    check('end day + km', ed.ok && Number(ed.attendance.km) > 0, ed.attendance);
  } catch (e) {
    failed++;
    out.push('FAIL  crashed: ' + e.stack);
  } finally {
    // Free the demo logins so you can sign in on your own phone.
    _tables = {};
    const U = table('Users');
    U.rows.forEach(u => { if (DEMO_USERS.some(d => d.phone === normPhone(u.phone))) U.set(u, { deviceId: '', token: '' }); });
    U.flush();
  }
  out.push(failed ? failed + ' FAILED' : 'ALL PASSED');
  console.log(out.join('\n'));
  return out.join('\n');
}

/** Removes demo users, demo restaurants and everything recorded against them. */
function clearDemo() {
  _book = SpreadsheetApp.getActiveSpreadsheet();
  _tables = {};
  const phones = DEMO_USERS.map(u => u.phone);
  const userIds = table('Users').rows.filter(u => phones.indexOf(normPhone(u.phone)) >= 0).map(u => u.id);
  const isDemoUser = id => userIds.indexOf(id) >= 0;
  const locIds = table('Locations').rows.filter(l => l.source === 'DEMO' || isDemoUser(l.createdBy)).map(l => l.id);
  const drop = (name, test) => {
    const sh = sheet(name);
    const T = table(name);
    for (let i = T.rows.length - 1; i >= 0; i--) if (test(T.rows[i])) sh.deleteRow(T.rows[i]._i + 2);
  };
  drop('Visits', v => isDemoUser(v.repId) || locIds.indexOf(v.locationId) >= 0);
  drop('Attendance', a => isDemoUser(a.repId));
  drop('Expenses', x => isDemoUser(x.repId));
  drop('Duplicates', d => isDemoUser(d.repId) || locIds.indexOf(d.newLocationId) >= 0);
  drop('Locations', l => locIds.indexOf(l.id) >= 0);
  drop('Users', u => isDemoUser(u.id));
  book().getSheets().filter(s => /^Track_/.test(s.getName())).forEach(s => {
    _tables = {};
    drop(s.getName(), t => isDemoUser(t.repId));
  });
  console.log('Demo data removed');
}
