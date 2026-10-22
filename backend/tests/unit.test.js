const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "t".repeat(40);
process.env.MONGO_URI = "mongodb://unused";

const sm = require("../utils/stateMachine");
const geo = require("../utils/geo");
const { getRoute, clearRouteCache } = require("../services/routing");
const { computeTimings } = require("../services/metrics");
const v = require("../utils/validate");
const { unitView, requestView } = require("../services/serialize");
const { HttpError } = require("../utils/response");

/* ------------------------------------------------ state machine */
test("state machine: valid transitions per role", () => {
  assert.ok(sm.canTransition("pending", "assigned", "admin"));
  assert.ok(sm.canTransition("pending", "cancelled", "user"));
  assert.ok(sm.canTransition("assigned", "accepted", "unit"));
  assert.ok(sm.canTransition("assigned", "pending", "unit")); // rejection
  assert.ok(sm.canTransition("accepted", "en-route", "unit"));
  assert.ok(sm.canTransition("en-route", "arrived", "unit"));
  assert.ok(sm.canTransition("arrived", "in-progress", "unit"));
  assert.ok(sm.canTransition("arrived", "completed", "unit"));
  assert.ok(sm.canTransition("in-progress", "completed", "unit"));
});

test("state machine: forbidden transitions", () => {
  // user cannot assign or complete their own request
  assert.equal(sm.canTransition("pending", "assigned", "user"), false);
  assert.equal(sm.canTransition("arrived", "completed", "user"), false);
  // user cannot cancel once the unit accepted
  assert.equal(sm.canTransition("accepted", "cancelled", "user"), false);
  // unit cannot skip steps or complete early
  assert.equal(sm.canTransition("assigned", "arrived", "unit"), false);
  assert.equal(sm.canTransition("accepted", "completed", "unit"), false);
  assert.equal(sm.canTransition("pending", "accepted", "unit"), false);
  // nothing leaves a terminal state
  for (const t of sm.TERMINAL_STATUSES)
    for (const role of ["user", "unit", "admin", "hospital"])
      assert.deepEqual(sm.allowedNext(t, role), [], `${t} must be terminal for ${role}`);
  // hospital never changes status
  for (const s of sm.STATUSES) assert.deepEqual(sm.allowedNext(s, "hospital"), []);
  // unknown input
  assert.equal(sm.canTransition("pending", "teleported", "admin"), false);
  assert.equal(sm.canTransition("nonsense", "assigned", "admin"), false);
});

/* ------------------------------------------------ geo: coordinate ordering */
test("geo: GeoJSON is [lng, lat] and round-trips correctly", () => {
  // Lahore: lat 31.5204, lng 74.3587
  const p = geo.toGeoPoint(31.5204, 74.3587);
  assert.deepEqual(p.coordinates, [74.3587, 31.5204]);
  assert.deepEqual(geo.fromCoordinates(p.coordinates), { latitude: 31.5204, longitude: 74.3587 });
});

test("geo: swapped coordinates are caught when out of range", () => {
  // someone sends [lat, lng] for Lahore as [lng, lat] -> lat=74.36 (valid!) lng=31.5 (valid) : ambiguous.
  // but for e.g. New York (lat 40.7, lng -74.0) swapped gives lat -74.0 (valid) ... use Lahore-like longitude > 90
  assert.equal(geo.parseLatLng(74.3587, 31.5204) !== null, true); // valid numbers - API cannot guess
  assert.equal(geo.parseLatLng(120, 31), null); // lat 120 impossible
  assert.equal(geo.fromCoordinates([31.5, 120]), null); // lat 120 impossible
});

test("geo: validation edge cases", () => {
  assert.equal(geo.parseLatLng("abc", 1), null);
  assert.equal(geo.parseLatLng(NaN, 1), null);
  assert.equal(geo.parseLatLng(null, null), null);
  assert.equal(geo.parseLatLng("", ""), null);
  assert.equal(geo.parseLatLng(90, 180) !== null, true);
  assert.equal(geo.parseLatLng(90.0001, 0), null);
  assert.equal(geo.parseLatLng(0, -180.0001), null);
  assert.deepEqual(geo.parseLatLng("31.5", "74.3"), { latitude: 31.5, longitude: 74.3 });
});

test("geo: haversine is sane (Lahore -> Islamabad ~ 270 km)", () => {
  const d = geo.haversineKm({ latitude: 31.5204, longitude: 74.3587 }, { latitude: 33.6844, longitude: 73.0479 });
  assert.ok(d > 250 && d < 290, `got ${d}`);
  assert.equal(geo.haversineKm({ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 1 }), 0);
});

/* ------------------------------------------------ routing (fake provider) */
const okBody = {
  code: "Ok",
  routes: [{ distance: 4200.4, duration: 600.2, geometry: { coordinates: [[74.35, 31.52], [74.36, 31.53]] } }],
};

test("routing: parses OSRM, converts [lng,lat] -> [lat,lng], labels as estimate", async () => {
  clearRouteCache();
  let seenUrl = "";
  const fetchImpl = async (url) => {
    seenUrl = url;
    return { ok: true, json: async () => okBody };
  };
  const r = await getRoute({ latitude: 31.52, longitude: 74.35 }, { latitude: 31.53, longitude: 74.36 }, { fetchImpl });
  // OSRM expects lng,lat order in the URL
  assert.match(seenUrl, /driving\/74\.35,31\.52;74\.36,31\.53/);
  assert.equal(r.distanceMeters, 4200);
  assert.equal(r.durationSeconds, 600);
  assert.deepEqual(r.geometry[0], [31.52, 74.35]);
  assert.equal(r.kind, "route-estimate");
  assert.notEqual(r.kind, "traffic-aware");
});

test("routing: provider failure modes return null (never a fake ETA)", async () => {
  clearRouteCache();
  const A = { latitude: 10, longitude: 10 };
  const B = { latitude: 10.1, longitude: 10.1 };
  assert.equal(await getRoute(A, B, { fetchImpl: async () => ({ ok: false }) }), null);
  assert.equal(await getRoute(A, B, { fetchImpl: async () => { throw new Error("ENOTFOUND"); } }), null);
  assert.equal(await getRoute(A, B, { fetchImpl: async () => ({ ok: true, json: async () => ({ code: "NoRoute", routes: [] }) }) }), null);
  assert.equal(await getRoute(A, B, { fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }) }), null);
});

test("routing: result is cached (second call does not hit provider)", async () => {
  clearRouteCache();
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => okBody }; };
  const A = { latitude: 20, longitude: 20 };
  const B = { latitude: 20.1, longitude: 20.1 };
  await getRoute(A, B, { fetchImpl });
  await getRoute(A, B, { fetchImpl });
  assert.equal(calls, 1);
});

test("routing: timeout aborts a hanging provider", async () => {
  clearRouteCache();
  process.env.ROUTING_TIMEOUT_MS = "50";
  const fetchImpl = (url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const t0 = Date.now();
  const r = await getRoute({ latitude: 30, longitude: 30 }, { latitude: 30.1, longitude: 30.1 }, { fetchImpl });
  assert.equal(r, null);
  assert.ok(Date.now() - t0 < 1000);
  delete process.env.ROUTING_TIMEOUT_MS;
});

/* ------------------------------------------------ metrics: no invented numbers */
test("metrics: empty data yields null stats, not zeros", () => {
  const t = computeTimings([]);
  assert.equal(t.dispatchDelay.sampleSize, 0);
  assert.equal(t.dispatchDelay.averageMinutes, null);
  assert.equal(t.timeToArrival.medianMinutes, null);
});

test("metrics: computes from real timestamps and ignores incomplete rows", () => {
  const T = (m) => new Date(Date.UTC(2026, 0, 1, 0, m));
  const rows = [
    { createdAt: T(0), assignedAt: T(2), statusHistory: [{ status: "arrived", at: T(12) }] }, // 2 / 10 / 12
    { createdAt: T(0), assignedAt: T(4), statusHistory: [{ status: "arrived", at: T(18) }] }, // 4 / 14 / 18
    { createdAt: T(0), assignedAt: T(6), statusHistory: [] }, // dispatch only
    { createdAt: T(0), assignedAt: null, statusHistory: [] }, // nothing
  ];
  const t = computeTimings(rows);
  assert.equal(t.dispatchDelay.sampleSize, 3);
  assert.equal(t.dispatchDelay.averageMinutes, 4);
  assert.equal(t.travelTime.sampleSize, 2);
  assert.equal(t.travelTime.averageMinutes, 12);
  assert.equal(t.timeToArrival.medianMinutes, 15);
});

/* ------------------------------------------------ validators */
test("validators reject bad input with HttpError(400)", () => {
  assert.throws(() => v.phone("abc"), HttpError);
  assert.throws(() => v.phone("12"), HttpError);
  assert.equal(v.phone("+92 300 1234567"), "+92 300 1234567");
  assert.throws(() => v.oneOf("x", ["a", "b"], "f"), HttpError);
  assert.throws(() => v.int("1.5", "n"), HttpError);
  assert.throws(() => v.int(-1, "n"), HttpError);
  assert.throws(() => v.objectId("not-an-id", "id"), HttpError);
  assert.throws(() => v.objectId({ $ne: null }, "id"), HttpError); // NoSQL injection shape
  assert.throws(() => v.reqString({ $gt: "" }, "f"), HttpError);
  assert.throws(() => v.reqString("   ", "f"), HttpError);
  assert.equal(v.objectId("507f1f77bcf86cd799439011", "id"), "507f1f77bcf86cd799439011");
});

/* ------------------------------------------------ privacy of serializers */
const fakeUnit = {
  _id: "507f1f77bcf86cd799439011",
  registrationNumber: "LEA-1234",
  vehicleModel: "Toyota HiAce",
  vehicleType: "advanced",
  availability: "available",
  contactNumber: "+92 300 0000000",
  location: { type: "Point", coordinates: [74.358712, 31.520412] },
  locationUpdatedAt: new Date(),
  locationAccuracy: 12,
};

test("privacy: public unit view hides plate/contact and rounds position", () => {
  const pub = unitView(fakeUnit, { exact: false });
  assert.equal(pub.registrationNumber, undefined);
  assert.equal(pub.contactNumber, undefined);
  assert.equal(pub.location.latitude, 31.52);
  assert.equal(pub.location.longitude, 74.359);
  assert.equal(pub.location.precision, "approximate");
  assert.equal(pub.location.accuracy, null);
  assert.match(pub.label, /^RESQ-[0-9A-F]{4}$/);
});

test("privacy: exact view only when explicitly requested; stale flag works", () => {
  const exact = unitView(fakeUnit, { exact: true, includePlate: true });
  assert.equal(exact.location.latitude, 31.520412);
  assert.equal(exact.registrationNumber, "LEA-1234");
  assert.equal(exact.location.stale, false);
  const old = unitView({ ...fakeUnit, locationUpdatedAt: new Date(Date.now() - 10 * 60 * 1000) }, { exact: true });
  assert.equal(old.location.stale, true);
  const never = unitView({ ...fakeUnit, locationUpdatedAt: null }, { exact: true });
  assert.equal(never.location.stale, true);
});

test("privacy: requester only sees exact unit position for an ACTIVE assignment", () => {
  const base = {
    _id: "607f1f77bcf86cd799439011",
    referenceId: "RSQ-1",
    emergencyType: "medical",
    status: "completed",
    location: { address: "x", coordinates: [74.3, 31.5] },
    assignedUnit: fakeUnit,
    requester: "507f1f77bcf86cd799439099",
  };
  const done = requestView(base, "user", { populatedUnitExact: true });
  assert.equal(done.assignedUnit.location.precision, "approximate");
  const active = requestView({ ...base, status: "en-route" }, "user", { populatedUnitExact: true });
  assert.equal(active.assignedUnit.location.precision, "exact");
  assert.equal(active.assignedUnit.registrationNumber, undefined); // plate never shown to the requester
  assert.deepEqual(active.allowedNext, []);
  assert.equal(active.location.latitude, 31.5);
  assert.equal(active.location.longitude, 74.3);
});
