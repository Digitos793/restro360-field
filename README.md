# Restro360 Field: sales app (PWA + Google Sheet)

Restaurant field sales ke liye app. Reps Android phone pe use karte hain, aur Manager/CEO kisi bhi browser se.
**Poora free hai.** Database Google Sheet hai, files Google Drive mein jaati hain, backend Apps Script hai, aur maps OpenStreetMap ke hain.

```
apps-script/Code.gs          → backend (Google Sheet ke Apps Script editor mein paste karna hai)
apps-script/appsscript.json  → Apps Script manifest (Drive OCR service on karta hai)
pwa/                         → app (free hosting pe upload karna hai: GitHub Pages / Netlify)
sample-locations.csv         → Locations sheet ka example
```

---

## Setup (ek baar, ~15 minute)

### 1. Google Sheet + Apps Script
1. Naya Google Sheet banao (jo Gmail account owner rahega, saara data usi ke Drive mein jayega).
2. **Extensions → Apps Script** kholo.
3. `Code.gs` ka saara content editor ke `Code.gs` mein paste karo (purana code hata do).
4. **Project Settings (⚙️) → "Show appsscript.json manifest file in editor"** tick karo. Phir `appsscript.json` kholo aur is repo wali file paste karo.
5. Editor mein function dropdown se **`setup`** select karke **Run** dabao. Google permission maangega (Sheets, Drive, Maps, Mail). Apna hi account hai, isliye **Allow** kar do.
   - Isse saari tabs ban jaayengi: Users, Locations, Visits, Attendance, Expenses, Duplicates, Audit, Settings
   - Drive mein "Restro360 Field Data" folder ban jayega
   - Default admin bhi ban jayega: phone **9999999999**, PIN **1234** (Users sheet mein turant badal dena)

### 2. Web App deploy
1. **Deploy → New deployment → ⚙️ → Web app**
2. Execute as: **Me**. Who has access: **Anyone**
3. **Deploy** dabao aur jo URL mile (`https://script.google.com/macros/s/.../exec`) use copy kar lo.

> "Anyone" se data public nahi hota. App har request pe login token check karta hai, aur manager ko sirf apni team ka data milta hai.

### 3. App ko free host karna
1. `pwa/config.js` kholo aur `API_URL` mein upar wala URL paste karo.
2. `pwa` folder ko kisi free HTTPS hosting pe daalo (PWA ke liye HTTPS zaroori hai). Inme se koi bhi chalega:
   - **Netlify Drop**: https://app.netlify.com/drop kholo aur `pwa` folder drag karke chhod do. URL turant mil jayega.
   - **GitHub Pages**: repo mein `pwa` folder ki files daalo, phir Settings → Pages → Deploy from branch.
3. Reps us URL ko Android Chrome mein kholein, phir **⋮ → Add to Home screen / Install app** karein.

> App seedha Apps Script se serve nahi ho sakta, kyunki Google wahan app ko iframe mein chalata hai. Wahan offline mode aur "Install app" kaam nahi karte. Isliye app alag free hosting pe hai aur Apps Script sirf data ka kaam karta hai.

---

## Roz ka kaam Google Sheet mein (yahi Admin panel hai)

### Users tab
| Column | Kya bharna hai |
|---|---|
| name | Poora naam |
| phone | 10-digit mobile (isi se login hota hai) |
| email | Manager ka email (duplicate alert ke liye, optional) |
| role | `REP`, `MANAGER`, `CEO` ya `ADMIN` |
| managerPhone | Rep ke manager ka phone. Isi se team banti hai |
| pin | Koi bhi PIN, jaise 4521. Pehle login pe ye apne aap encrypt ho jata hai |
| active | `TRUE` (rep chhod de toh `FALSE`) |

Baaki columns (id, token, deviceId…) app khud bharta hai.
- **PIN bhool gaye?** `pin` cell mein naya PIN likh do.
- **Rep ne phone badla?** `deviceId` cell khaali kar do.
- **Phone kho gaya / rep ne job chhodi?** `forceLogout` = `TRUE` kar do. Agli baar app khulte hi logout hoga aur phone ka data mit jayega. Saath mein `active` = `FALSE` bhi kar do.

### Locations tab (target list)
CSV ya Excel se rows copy karke seedha paste kar do (columns: name, type, address, area, pincode, lat, lng, ownerName, ownerPhone… `sample-locations.csv` dekho).
- id aur status apne aap bhar jaate hain. Agar na bharein toh menu **Restro360 → Generate IDs for new rows** chalao.
- lat/lng nahi hai? Menu **Restro360 → Fill missing lat/lng from address** chalao (free, ek baar mein 200).
- Phir Manager panel ke **Plan route** se reps ko assign karo.

### Settings tab
Geofence distance, lead protection days (30), minimum visit time, modules ki list, not-interested reasons, brochure/demo video/price sheet links, aur WhatsApp message template.

---

## App mein kya hai

**Rep (phone)**
- Phone + PIN login, ek phone pe lock
- Pehli baar DPDP consent (naam likh ke)
- Day start/end: selfie + GPS
- Today's plan: manager ka order, map, "Nearest first", Google Maps navigation
- Visit form: GPS geofence check, address apne aap, business details, current POS + contract expiry, Owner + Manager/IT contacts, business card photo + **OCR (free, Google Drive ka)**, storefront/interior/counter photos, notes + voice note, outcome (Interested + modules / Demo / Follow-up / Not interested + reason / DM not available)
- Visit beech mein band ho jaye toh draft save rehta hai ("Resume")
- Naya restaurant (walk-in) daalte hi "Already in system" check
- **Offline**: sab kuch phone mein save hota hai aur net aate hi upload ho jata hai
- Visit ke baad WhatsApp intro message (brochure link ke saath)
- Follow-ups list, expenses + receipt photo, pitch kit links

**Manager / CEO / Admin (browser)**
- Dashboard: KPIs, reps ki last location ka map, aaj ke visits
- Leads: search, stage filter, poori timeline (photos, card, voice note), stage change, reassign
- Plan route: locations add karo, auto-order (nearest), drag/arrows se order badlo, suggested time (lunch rush 12:30–3 skip), phir publish
- Route replay: GPS route, stops/idle time, planned vs actual
- Reports: funnel (Visited → Interested → Demo → Closed), per-rep, per-area, CSV export (Excel mein khulta hai), Print/PDF
- Duplicates: manager ko doosri team ki lead masked dikhti hai ("Existing lead, owned by another team"). CEO/Admin dono records side-by-side dekh ke merge karte hain ya owner decide karte hain.

**Backend apne aap karta hai**: duplicate check (phone / email / same naam 50 m ke andar), 30 din lead protection, quality score (0–100), suspicious visit flags (bahut chhota visit, location se door, GPS kamzor, impossible speed), har edit/export ka audit log, aur manager export limit.

---

## Kya skip kiya (paid tha ya Sheets/browser mein possible nahi)

| Feature | Kyun skip | Ab kya hai |
|---|---|---|
| OTP login | SMS gateway paid hai | Phone + PIN + ek-phone lock |
| Google Places / Routes API | Billing chahiye | OpenStreetMap map, Apps Script ka free geocoder, nearest-first ordering |
| AI summary / audio transcription | Paid API | Voice note save + play hota hai, notes typed |
| Background GPS (app band ho tab bhi) | Browser app band hone pe GPS nahi deta | Route tab record hota hai jab app khula ho aur day started ho. Check-in/out pe GPS hamesha |
| Fake GPS app detection | Browser se pata nahi chalta | Geofence, impossible speed aur weak GPS ke flags |
| Phone number OTP verify | Paid | Tap-to-call / WhatsApp link |
| Push notifications | Server push Apps Script se mushkil hai | App kholte hi Follow-ups list aur home pe count |
| Card edge detection | Native feature hai | Normal photo + OCR |
| Hindi UI | Simple rakhne ke liye | Notes Hindi mein likh sakte hain |

---

## Code update karna ho toh
- **Code.gs badla?** Deploy → Manage deployments → ✏️ Edit → Version: **New version** → Deploy. URL wahi rehta hai.
- **pwa files badli?** Hosting pe dobara upload karo. Reps ko agli baar app online kholne pe naya version mil jayega.

## Free limits (chhoti-medium team ke liye kaafi)
- Google Drive 15 GB (photos ~150–250 KB compress hoke jaati hain)
- MailApp: ~100 email/day (sirf duplicate alerts)
- Ek Sheet tab mein ~50,000+ rows tak theek chalta hai. GPS route har mahine nayi tab (`Track_2026_10`) mein jaata hai. Purane mahine ki tab chahiye toh archive/delete kar sakte ho.
