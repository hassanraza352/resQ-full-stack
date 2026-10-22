# Architecture, audit findings and decisions

## Audit of the uploaded project (what existed)
* Auth (register/login/me/logout, JWT in HTTP-only cookie, `protect`/`authorize`, `ProtectedRoute`) worked and was **kept**.
* Backend had models/controllers for units, hospitals and emergencies but the **frontend dashboards were static mock-ups** (hard-coded numbers, fake map pins, console.log buttons). Only login/register/`/auth/me` called the API.
* Problems found and fixed:
  * `Unit`/`Hospital` GeoJSON `location.type` had a default but no coordinates → a 2dsphere index rejects such documents; `type` default removed (location now optional until set).
  * `routes/adminRoutes.js` declared `GET /dashboard` twice (the stats handler was unreachable) → merged.
  * No rate limiting, helmet, CORS allow-list/CSRF origin check, request validation or central error handler.
  * `unit/map` and `unit/setting` re-used the *user* pages; `admin/units.tsx` existed but had no route; sidebar logo/links used full page reloads; the sidebar "Hospitals" link pointed to a non-existent path; theme toggle toggled `body.dark` while the CSS uses `[data-theme="dark"]`; logout was only a link.
  * Emergency requests had no reference id, history, idempotency, priority or hospital response; units could not reject; no location updates; no notifications/messages.
  * `.env` in the zip contained database credentials in a comment (see "Security notes").

## What was added (backend)
Models extended: `User.isActive/emergencyContact`, `Unit` (location freshness/accuracy), `Hospital` (location, beds, staff directory), `EmergencyRequest` (referenceId, clientRequestId, priority, statusHistory, assignmentHistory, rejectedUnits, hospitalResponse, location accuracy/source). New: `Notification` (90-day TTL), `Message`. No duplicate Assignment model: the assignment lives on the request (`assignedUnit` + `assignmentHistory`).

* `utils/stateMachine.js` – single source of truth for transitions per role. `utils/geo.js` – the only place coordinates are converted. `services/routing.js` – OSRM client (timeout, cache, graceful null). `services/dispatch.js` – `$geoNear` discovery. `services/serialize.js` – per-viewer privacy shaping. `services/access.js` – object-level authorization. `socket/` – authenticated Socket.IO.
* **Dispatch concurrency (no transactions needed on a standalone MongoDB):** (1) atomically flip the chosen unit `available→busy` with a conditional `findOneAndUpdate`; (2) compare-and-set the request on its expected `status`/`assignedUnit`; (3) roll the reservation back on any failure. Two admins racing for the same unit or request → exactly one 200, one 409.
* Idempotent creation via `Idempotency-Key` + unique partial index; one active request per user (application check).
* Privacy: public nearby view rounds coordinates, hides plate/contact, only available+verified+recently-seen units; requester sees exact unit position only for an *active* assignment; hospitals never see requester email; only the latest unit point is stored (no history).

## Frontend
Shared `AppLayout` (role navigation, live-connection badge, notification bell, working theme toggle, real logout), `MapView` (Leaflet, legend, draggable marker, accuracy circle, route polyline, tile-error message), `NearbyUnits`, `LocationGate` (explains before asking; handles denied / timeout / unavailable / insecure), `Chat`, `SettingsPage`, `useFetch` (loading/error/retry), `useLive` (socket events + resync after reconnect). Visual classes/CSS from the original design are reused; the original commercial overlay on the user dashboard is preserved.
Intentional changes to existing UI: fake statistics/pins replaced by real data; "Crime" incident chip removed (RESQ dispatches ambulances; the backend has no such category) and replaced by Cardiac/Pregnancy; the non-functional media-upload control replaced by a notice.

## Security summary
Role always read from DB (token role ignored) · bcrypt(12) + timing-equalised login · deactivation takes effect immediately · helmet · CORS allow-list with credentials · CSRF defence for cookie auth = SameSite + strict Origin allow-list for unsafe methods + JSON-only bodies · rate limits (login 20/15 min, register, API, emergency creation, search, unit GPS) · body sanitiser strips `$`/`.` keys and all ids/enums are validated · errors never echo bodies/cookies · secure cookie in production · socket handshake authenticated and room joins checked against the DB.

## Known limitations (be honest in the demo)
* **Routing/ETA** uses the public OSRM demo server by default: no live traffic, fair-use policy, no SLA. Always labelled "route estimate". Run your own OSRM or a commercial API for production.
* **Map tiles** are OpenStreetMap's public tile server (acceptable for a demo; use a tile provider for production traffic).
* Logout clears the cookie but a stolen JWT stays valid until expiry (no server-side revocation list).
* Real-time uses a single Node process; multiple instances would need the Socket.IO Redis adapter.
* Unit position is only as fresh as the unit's browser tab (a backgrounded mobile tab may stop sending GPS). Stale positions are flagged and excluded from "available" discovery after `UNIT_LOCATION_MAX_AGE_MIN`.
* Hospital capacity is self-reported; stale numbers are flagged after 6 h.
* No media upload, no push/SMS, no geocoding (address text is typed by the user), no Docker files were added (none existed).
* Not validated for real emergency operations.
