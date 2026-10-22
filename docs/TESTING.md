# Test report (what was really run)

Environment used while building: Node 22, **no MongoDB binary and no outbound access to OSRM/OpenStreetMap** (sandbox restrictions).

## Executed and passing
| Command | Result |
|---|---|
| `cd backend && npm test` | **41 / 41 passed** |
| `cd frontend/vite-project && npx tsc -b` | no type errors |
| `npm run build` (frontend) | builds (bundle ≈ 680 kB, Vite warns about size) |
| `npx eslint src` | 0 errors, 15 warnings (React-compiler style rules relaxed to warnings; baseline had 2 errors) |

What the 41 tests cover (DB models stubbed where a user lookup is needed):
state-machine transitions incl. forbidden ones · `[lng,lat]` ↔ lat/lng conversion and range validation · haversine · OSRM parsing, `[lng,lat]→[lat,lng]`, caching, timeout, failure → `null` · metrics return `null` instead of invented numbers · validators / NoSQL-injection shapes · privacy serializers (rounding, plate hidden, stale flag, exact-only-when-active) · no cookie / forged / alg=none / wrong-secret / expired tokens → 401 · deleted account 401, deactivated 403 · DB role beats token role · **role matrix: every route under `/api/admin`, `/api/units`, `/api/hospitals` rejects anonymous (401) and every other role (403)** · user-only emergency routes reject unit/hospital/admin · cannot self-register admin · registration/login validation, no user enumeration, no password/hash/token in responses, HttpOnly + SameSite cookie · logout clears cookie · cross-site Origin blocked, form-encoded body rejected, CORS credentials only for allowed origin · helmet headers, malformed JSON → 400, unknown route → JSON 404 · invalid coordinates rejected before any DB access · login rate limiting → 429.

## Written but NOT executed here
`backend/tests/integration.test.js` (needs a MongoDB; uses mongodb-memory-server and a fake local OSRM server). It covers: unit verification gate, GeoJSON order stored, `$geoNear` radius/sort/privacy, full lifecycle create→assign→accept→en-route→arrived→in-progress→completed with unit release, idempotency, object-level isolation (other user/unit/hospital get 404), **concurrent assignment races (same unit; same request)**, unit rejection + reassignment visibility, cancel policy, hospital proposal vs acceptance, messaging authorization, notification ownership, metrics, deactivation. **Run `npm run test:integration` on your machine; treat any failure as a real finding to fix** — I could not observe these results.

## Not verified at all
* The React UI in a real browser (no browser available): layouts, Leaflet rendering on mobile, GPS prompts, live socket updates were type-checked and built but not visually exercised.
* Real OSRM responses, real GPS, Socket.IO message delivery end-to-end, MongoDB `2dsphere` behaviour with real data.
* Load/performance, accessibility audit, multi-instance deployment.

## Manual checklist for your demo machine
GPS allowed · GPS denied (manual marker) · insecure origin message · routing down (set `ROUTING_BASE_URL` to a bad host → "route unavailable" banners, straight-line shown) · stale unit (stop sharing 15 min) · no units in radius (warning + escalation hint) · two admins assigning the same unit · unit rejects · user cancel while assigned · hospital declines · expired cookie (delete cookie, reload) · wrong-role direct URL.
