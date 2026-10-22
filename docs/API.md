# RESQ API reference

Base URL: `http://localhost:5000/api` · Auth: HTTP-only cookie `resq_token` (send `credentials: include`).
All responses: `{ "success": boolean, "message"?: string, ...payload, "meta"?: {page,limit,total,pages} }`.
Errors: `400` validation · `401` not logged in / expired / invalid token · `403` wrong role or deactivated · `404` not found *or not yours* · `409` state conflict · `415` non-JSON body · `429` rate limited.
Coordinates: query/body use `latitude`/`longitude` (`lat`/`lng` in query strings); MongoDB stores `[longitude, latitude]`; Leaflet uses `[latitude, longitude]`.

## Auth & session
| Method & path | Role | Body / query | Notes |
|---|---|---|---|
| POST `/auth/register` | public | `name,email,password(8-128),phone,role(user\|unit\|hospital)` | `admin` role rejected. Unit/hospital start unverified. Rate-limited. |
| POST `/auth/login` | public | `email,password,role` | Role must equal DB role (403 otherwise). Sets cookie. Rate-limited (20/15 min). |
| POST `/auth/logout` | any | – | Clears cookie. |
| GET `/auth/me` | any | – | Safe profile. |
| PATCH `/auth/profile` | any | `name?,phone?,emergencyContact?{name,phone}` | Never role/email. |
| PATCH `/auth/password` | any | `currentPassword,newPassword` | |

## User – emergencies (role `user`; object-level: own records only)
| Method & path | Body / query | Notes |
|---|---|---|
| POST `/emergencies` | `emergencyType(medical\|accident\|cardiac\|pregnancy\|fire\|other), contactNumber, address, latitude, longitude, accuracy?, locationSource?(gps\|manual\|adjusted), description?` + header `Idempotency-Key` | 201 + `referenceId` (`RSQ-YYMMDD-XXXXXX`). Same key → 200 `duplicate:true`. One active request per user (409). 10/10 min. |
| GET `/emergencies/my` | `scope=all\|active\|history, status?, page, limit` | |
| GET `/emergencies/:id` | – | Assigned unit exact position only while assignment is active; plate never shown. |
| PATCH `/emergencies/:id/cancel` | `reason?` | Only `pending` or `assigned` (unit not yet accepted). Releases the unit. |
| GET `/emergencies/nearby-units` | `lat,lng,radiusKm?,limit?,page?` | **Informational.** Verified + available + fresh GPS only; coordinates rounded (~110 m); straight-line km + route-based ETA (`road`, may be `null`). |
| GET `/emergencies/:id/route` | – | roles user (own), unit (assigned), admin. `route:null` + `reason` when the router is down. |
| GET/POST `/emergencies/:id/messages` | `text` | participants only (requester, assigned unit/hospital, admin). Sending only while request is open. |

## Hospitals
| Method & path | Role | Notes |
|---|---|---|
| GET `/hospitals/nearby?lat&lng&radiusKm` | any signed-in | verified hospitals; beds with `updatedAt`/`stale`. |
| POST `/hospitals/register` | hospital | `hospitalName,registrationNumber,address,contactNumber,emergencyCapacity,latitude?,longitude?` (starts pending / not-accepting) |
| GET/PATCH `/hospitals/me` | hospital | PATCH `address,contactNumber,latitude,longitude` |
| PATCH `/hospitals/availability` | hospital (verified) | `emergencyAvailability: accepting\|not-accepting` |
| PATCH `/hospitals/beds` | hospital (verified) | `totalBeds,availableBeds,icuTotal,icuAvailable` (available ≤ total) |
| GET/POST `/hospitals/staff`, PATCH/DELETE `/hospitals/staff/:staffId` | hospital | directory entries, not logins |
| GET `/hospitals/emergencies/incoming` · GET `/hospitals/cases/history` · GET `/hospitals/cases/:id` | hospital (verified) | only cases assigned to *this* hospital; no requester email |
| PATCH `/hospitals/cases/:id/respond` | hospital (verified) | `response: accepted\|declined, note?` |

## Units (role `unit`; object-level: own unit/assignments only)
| Method & path | Body | Notes |
|---|---|---|
| POST `/units/register` | `registrationNumber,vehicleModel,vehicleType,contactNumber,capacity` | always `offline` + `pending` |
| GET `/units/me`, PATCH `/units/me` | `contactNumber` | |
| PATCH `/units/availability` | `availability: available\|offline` | verified only; needs a stored position; not while `busy` |
| PATCH `/units/location` | `latitude,longitude,accuracy?` | verified only; 5 per 10 s; **only latest point stored** |
| GET `/units/emergencies/assigned` · `/units/emergencies/history` | – | |
| PATCH `/units/emergencies/:id/status` | `status` | accepted → en-route → arrived → in-progress? → completed; anything else 400 |
| PATCH `/units/emergencies/:id/reject` | `reason?` | only while `assigned`; request returns to `pending` |

## Admin (role `admin`; every route re-checked server-side)
| Method & path | Notes |
|---|---|
| GET `/admin/dashboard`, `/admin/metrics` | DB aggregates; timings are `null` when no data |
| GET `/admin/reports?days=` | by type/status/priority/day + timings |
| GET `/admin/users`, PATCH `/admin/users/:id/active` | `{isActive}`; cannot change self |
| PATCH `/admin/users/:id/assign-unit` \| `assign-hospital` | legacy role assignment |
| GET `/admin/units`, `/units/pending`, `/units/available`; PATCH `/admin/units/:id/review` | `{status: verified\|rejected}` (once) |
| GET `/admin/hospitals`, `/hospitals/pending`, `/hospitals/available`; PATCH `/admin/hospitals/:id/review` | |
| GET `/admin/emergencies` | `status(csv),scope,emergencyType,priority,from,to,q,sort,page,limit` |
| GET `/admin/emergencies/:id` · `/candidates?radiusKm&includeStale` | candidates: straight-line, road ETA, eligibility, current assignment, rejected-before |
| PATCH `/admin/emergencies/:id/assign` · `/reassign` | `{unitId,note?}` – atomic reservation; 409 if unit taken/ineligible |
| PATCH `/admin/emergencies/:id/assign-hospital` | proposal only (`hospitalResponse: pending`) |
| PATCH `/admin/emergencies/:id/priority` · `/cancel` · `/reject` | cancel/reject need `reason` |

## Notifications & messages
`GET /notifications?unread=&page`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `GET /messages/threads`. Notifications auto-expire after 90 days.

## Socket.IO (same origin as API, cookie auth)
Server → client: `emergency:new` (admins), `emergency:updated`, `assignment:new`, `notification:new`, `message:new`, `unit:location`. Payloads carry ids/status only; clients re-fetch over REST (also on reconnect).
Client → server: `request:join {requestId}` (ack `{ok}`; server verifies access in the DB), `request:leave`.

## Status machine
`pending → assigned → accepted → en-route → arrived → (in-progress →) completed`; `pending → rejected` (admin); `pending|assigned → cancelled` (user); any open state → `cancelled` (admin); `assigned → pending` (unit rejects). Terminal: completed, cancelled, rejected.
