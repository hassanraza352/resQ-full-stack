/**
 * Road routing via an OSRM-compatible HTTP API.
 *
 * IMPORTANT: the default public OSRM demo server has NO traffic data, no SLA and a
 * fair-use policy. Results are therefore labelled "route-estimate" (road geometry +
 * typical-speed duration), never "traffic-aware". For production, point
 * ROUTING_BASE_URL at your own OSRM instance or a commercial provider.
 */
const { load } = require("../config/env");

const cache = new Map(); // key -> { expires, value }
const MAX_CACHE = 500;

const round = (n) => Math.round(n * 1e4) / 1e4; // ~11 m: stable cache keys

const keyOf = (from, to) =>
  `${round(from.latitude)},${round(from.longitude)}>${round(to.latitude)},${round(to.longitude)}`;

/**
 * @param {{latitude:number,longitude:number}} from  e.g. the unit
 * @param {{latitude:number,longitude:number}} to    e.g. the incident
 * @param {{fetchImpl?: Function}} [opts]
 * @returns {Promise<null | {distanceMeters:number,durationSeconds:number,geometry:Array<[number,number]>,provider:string,kind:string,computedAt:string}>}
 *          geometry is [[lat,lng],...] ready for Leaflet. Returns null if routing is unavailable.
 */
const getRoute = async (from, to, { fetchImpl } = {}) => {
  const cfg = load();
  const doFetch = fetchImpl || globalThis.fetch;
  const k = keyOf(from, to);

  const hit = cache.get(k);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url =
    `${cfg.routingBaseUrl.replace(/\/$/, "")}/route/v1/driving/` +
    `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.routingTimeoutMs);

  try {
    const res = await doFetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "RESQ-university-project/1.0" },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const route = body?.routes?.[0];
    if (body?.code !== "Ok" || !route) return null;

    const value = {
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      // OSRM GeoJSON is [lng, lat] -> Leaflet wants [lat, lng]
      geometry: (route.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]),
      provider: "osrm",
      kind: "route-estimate", // NOT traffic-aware
      computedAt: new Date().toISOString(),
    };

    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(k, { expires: Date.now() + cfg.routingCacheTtlSec * 1000, value });
    return value;
  } catch (_err) {
    return null; // timeout / network / bad JSON: callers must handle "no route"
  } finally {
    clearTimeout(timer);
  }
};

const clearRouteCache = () => cache.clear();

module.exports = { getRoute, clearRouteCache };
