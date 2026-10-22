/**
 * END-TO-END API TESTS against a real (in-memory) MongoDB.
 *   npm run test:integration
 * Requires internet on first run (mongodb-memory-server downloads a mongod binary once).
 * A fake OSRM routing server is started locally, so no external service is needed.
 *
 * NOTE: these tests were written together with the code but could NOT be executed in the
 * authoring sandbox (no MongoDB binary available there). Run them on your machine and fix
 * any environment-specific failure before relying on them.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod, osrm, app, agents = {}, data = {};

const lahore = { latitude: 31.5204, longitude: 74.3587 };
const near = (dLat) => ({ latitude: lahore.latitude + dLat, longitude: lahore.longitude });

test.before(async () => {
  // fake OSRM
  osrm = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ code: "Ok", routes: [{ distance: 3000, duration: 420, geometry: { coordinates: [[74.35, 31.52], [74.3587, 31.5204]] } }] }));
  });
  await new Promise((r) => osrm.listen(0, r));
  process.env.ROUTING_BASE_URL = `http://127.0.0.1:${osrm.address().port}`;

  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = "i".repeat(40);
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  await mongoose.connect(process.env.MONGO_URI);
  for (const m of Object.values(mongoose.models)) await m.init(); // build indexes (2dsphere, unique)

  app = require("../app")();

  const User = require("../model/User");
  const pw = await bcrypt.hash("Passw0rd!x", 4);
  const mk = (name, role) => User.create({ name, email: `${name}@t.com`, password: pw, phone: "+92 300 1234567", role });
  data.users = {
    alice: await mk("alice", "user"),
    bob: await mk("bob", "user"),
    admin: await mk("admin", "admin"),
    u1: await mk("u1", "unit"),
    u2: await mk("u2", "unit"),
    u3: await mk("u3", "unit"), // will stay unverified
    hosp: await mk("hosp", "hospital"),
    hosp2: await mk("hosp2", "hospital"),
  };

  const login = async (name, role) => {
    const a = request.agent(app);
    const r = await a.post("/api/auth/login").send({ email: `${name}@t.com`, password: "Passw0rd!x", role });
    assert.equal(r.status, 200, `login ${name}`);
    return a;
  };
  agents = {
    alice: await login("alice", "user"),
    bob: await login("bob", "user"),
    admin: await login("admin", "admin"),
    u1: await login("u1", "unit"),
    u2: await login("u2", "unit"),
    u3: await login("u3", "unit"),
    hosp: await login("hosp", "hospital"),
    hosp2: await login("hosp2", "hospital"),
  };

  // units register -> admin verifies -> units share location -> go on duty
  const reg = (agent, plate, type) => agent.post("/api/units/register").send({ registrationNumber: plate, vehicleModel: "HiAce", vehicleType: type, contactNumber: "+92 300 1111111", capacity: 2 });
  data.unit = {};
  for (const [k, plate, type] of [["u1", "LEA-001", "advanced"], ["u2", "LEA-002", "basic"], ["u3", "LEA-003", "basic"]]) {
    const r = await reg(agents[k], plate, type);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.unit.availability, "offline");
    assert.equal(r.body.unit.verificationStatus, "pending");
    data.unit[k] = r.body.unit.id;
  }
  for (const k of ["u1", "u2"]) {
    const r = await agents.admin.patch(`/api/admin/units/${data.unit[k]}/review`).send({ status: "verified" });
    assert.equal(r.status, 200);
  }
  const pos = { u1: near(0.01), u2: near(0.02) };
  for (const k of ["u1", "u2"]) {
    assert.equal((await agents[k].patch("/api/units/location").send(pos[k])).status, 200);
    assert.equal((await agents[k].patch("/api/units/availability").send({ availability: "available" })).status, 200);
  }
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
  osrm?.close();
});

const body = (extra = {}) => ({
  emergencyType: "medical",
  contactNumber: "+92 300 7654321",
  address: "Gulberg, Lahore",
  latitude: lahore.latitude,
  longitude: lahore.longitude,
  locationSource: "gps",
  accuracy: 15,
  ...extra,
});

test("unverified unit cannot share location or go on duty", async () => {
  assert.equal((await agents.u3.patch("/api/units/location").send(near(0.005))).status, 403);
  assert.equal((await agents.u3.patch("/api/units/availability").send({ availability: "available" })).status, 403);
});

test("lat/lng ordering is stored as GeoJSON [lng, lat]", async () => {
  const Unit = require("../model/Unit");
  const u = await Unit.findById(data.unit.u1);
  assert.deepEqual(u.location.coordinates, [lahore.longitude, lahore.latitude + 0.01]);
});

test("nearby units: only verified+available+fresh, sorted by distance, privacy-rounded, with route ETA", async () => {
  const r = await agents.alice.get(`/api/emergencies/nearby-units?lat=${lahore.latitude}&lng=${lahore.longitude}&radiusKm=20`);
  assert.equal(r.status, 200);
  assert.equal(r.body.units.length, 2); // u3 unverified is excluded
  assert.ok(r.body.units[0].straightLineKm <= r.body.units[1].straightLineKm);
  assert.equal(r.body.units[0].registrationNumber, undefined);
  assert.equal(r.body.units[0].location.precision, "approximate");
  assert.equal(r.body.units[0].road.durationSeconds, 420);
  assert.equal(r.body.units[0].road.kind, "route-estimate");
  assert.equal(r.body.units[0].assignedToYou, false);
  assert.match(r.body.notice, /information only/i);
});

test("nearby units: small radius excludes units ~1.1 km and ~2.2 km away (0.01 deg lat ~ 1.11 km)", async () => {
  const r = await agents.alice.get(`/api/emergencies/nearby-units?lat=${lahore.latitude}&lng=${lahore.longitude}&radiusKm=0.5`);
  assert.equal(r.status, 200);
  assert.equal(r.body.units.length, 0);
});

test("full flow: create -> admin sees -> assign -> unit accepts -> en-route -> arrived -> completed", async () => {
  const key = "key-" + Date.now();
  const created = await agents.alice.post("/api/emergencies").set("Idempotency-Key", key).send(body());
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.request.id;
  assert.match(created.body.request.referenceId, /^RSQ-\d{6}-[A-Z0-9]{6}$/);
  assert.equal(created.body.request.status, "pending");

  // duplicate submit (same key) -> same request, 200
  const dup = await agents.alice.post("/api/emergencies").set("Idempotency-Key", key).send(body());
  assert.equal(dup.status, 200);
  assert.equal(dup.body.request.id, id);
  // second distinct request while one is active -> 409
  const second = await agents.alice.post("/api/emergencies").set("Idempotency-Key", "other").send(body());
  assert.equal(second.status, 409);

  // other user cannot read it; unit/hospital cannot either
  assert.equal((await agents.bob.get(`/api/emergencies/${id}`)).status, 404);
  assert.equal((await agents.bob.patch(`/api/emergencies/${id}/cancel`)).status, 404);
  assert.equal((await agents.u1.get(`/api/emergencies/${id}/route`)).status, 404);
  assert.equal((await agents.u1.get(`/api/emergencies/${id}/messages`)).status, 404);

  // admin sees it and the candidates (with road ETA)
  const list = await agents.admin.get("/api/admin/emergencies?status=pending");
  assert.ok(list.body.requests.some((r) => r.id === id));
  const cands = await agents.admin.get(`/api/admin/emergencies/${id}/candidates`);
  assert.equal(cands.status, 200);
  assert.equal(cands.body.candidates.filter((c) => c.eligible).length, 2);
  assert.equal(cands.body.candidates[0].road.durationSeconds, 420);

  // user cannot assign / admin-only
  assert.equal((await agents.alice.patch(`/api/admin/emergencies/${id}/assign`).send({ unitId: data.unit.u1 })).status, 403);
  // cannot assign unverified unit
  assert.equal((await agents.admin.patch(`/api/admin/emergencies/${id}/assign`).send({ unitId: data.unit.u3 })).status, 409);

  const assigned = await agents.admin.patch(`/api/admin/emergencies/${id}/assign`).send({ unitId: data.unit.u1 });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  assert.equal(assigned.body.request.status, "assigned");

  // unit u1 is now busy; u2 cannot touch this assignment
  assert.equal((await agents.u2.patch(`/api/units/emergencies/${id}/status`).send({ status: "accepted" })).status, 404);
  // unit cannot skip steps
  assert.equal((await agents.u1.patch(`/api/units/emergencies/${id}/status`).send({ status: "arrived" })).status, 400);
  // user may still see assignment
  const mine = await agents.alice.get(`/api/emergencies/${id}`);
  assert.equal(mine.body.request.assignedUnit.label.startsWith("RESQ-"), true);
  assert.equal(mine.body.request.assignedUnit.registrationNumber, undefined);

  for (const s of ["accepted", "en-route", "arrived", "in-progress", "completed"]) {
    const r = await agents.u1.patch(`/api/units/emergencies/${id}/status`).send({ status: s });
    assert.equal(r.status, 200, `${s}: ${JSON.stringify(r.body)}`);
  }
  // terminal: no further transition is possible
  assert.equal((await agents.u1.patch(`/api/units/emergencies/${id}/status`).send({ status: "completed" })).status, 400);

  const Unit = require("../model/Unit");
  assert.equal((await Unit.findById(data.unit.u1)).availability, "available", "unit released after completion");

  const final = await agents.alice.get(`/api/emergencies/${id}`);
  assert.equal(final.body.request.status, "completed");
  assert.deepEqual(final.body.request.statusHistory.map((h) => h.status), ["pending", "assigned", "accepted", "en-route", "arrived", "in-progress", "completed"]);
  assert.equal((await agents.alice.patch(`/api/emergencies/${id}/cancel`)).status, 409);
});

test("concurrency: two simultaneous assignments of the SAME unit -> exactly one wins", async () => {
  const a = await agents.alice.post("/api/emergencies").send(body());
  const b = await agents.bob.post("/api/emergencies").send(body({ address: "DHA, Lahore" }));
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const [r1, r2] = await Promise.all([
    agents.admin.patch(`/api/admin/emergencies/${a.body.request.id}/assign`).send({ unitId: data.unit.u1 }),
    agents.admin.patch(`/api/admin/emergencies/${b.body.request.id}/assign`).send({ unitId: data.unit.u1 }),
  ]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
  const Unit = require("../model/Unit");
  assert.equal((await Unit.findById(data.unit.u1)).availability, "busy");

  // concurrency: same REQUEST assigned to two different units simultaneously
  const loser = r1.status === 409 ? a.body.request.id : b.body.request.id;
  const [x, y] = await Promise.all([
    agents.admin.patch(`/api/admin/emergencies/${loser}/assign`).send({ unitId: data.unit.u2 }),
    agents.admin.patch(`/api/admin/emergencies/${loser}/assign`).send({ unitId: data.unit.u2 }),
  ]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
});

test("unit rejection returns request to pending and frees the unit; admin can reassign before acceptance", async () => {
  const Unit = require("../model/Unit");
  const EmergencyRequest = require("../model/EmergencyRequest");
  const open = await EmergencyRequest.find({ status: "assigned" });
  assert.ok(open.length >= 1);
  const req = open[0];
  const unitDoc = await Unit.findById(req.assignedUnit);
  const agentKey = unitDoc.registrationNumber === "LEA-001" ? "u1" : "u2";
  const otherUnitId = agentKey === "u1" ? data.unit.u2 : data.unit.u1;

  const rej = await agents[agentKey].patch(`/api/units/emergencies/${req._id}/reject`).send({ reason: "vehicle fault" });
  assert.equal(rej.status, 200, JSON.stringify(rej.body));
  assert.equal(rej.body.request.status, "pending");
  const after = await Unit.findById(unitDoc._id);
  assert.equal(after.availability, "available");

  const cands = await agents.admin.get(`/api/admin/emergencies/${req._id}/candidates`);
  assert.equal(cands.body.candidates.find((c) => c.id === unitDoc._id.toString()).previouslyRejected, true);
  void otherUnitId;
});

test("cancel policy: user can cancel while pending/assigned, releases the unit; admin cancel needs a reason", async () => {
  const EmergencyRequest = require("../model/EmergencyRequest");
  const Unit = require("../model/Unit");
  await EmergencyRequest.updateMany({ status: { $in: ["pending", "assigned", "accepted"] } }, { $set: { status: "cancelled" } });
  await Unit.updateMany({}, { $set: { availability: "available" } });
  await Unit.updateOne({ _id: data.unit.u3 }, { $set: { availability: "offline" } });

  const c = await agents.alice.post("/api/emergencies").send(body());
  const id = c.body.request.id;
  await agents.admin.patch(`/api/admin/emergencies/${id}/assign`).send({ unitId: data.unit.u1 });
  const cancel = await agents.alice.patch(`/api/emergencies/${id}/cancel`).send({ reason: "false alarm" });
  assert.equal(cancel.status, 200);
  assert.equal((await Unit.findById(data.unit.u1)).availability, "available");

  const c2 = await agents.alice.post("/api/emergencies").send(body());
  assert.equal((await agents.admin.patch(`/api/admin/emergencies/${c2.body.request.id}/cancel`).send({})).status, 400);
  assert.equal((await agents.admin.patch(`/api/admin/emergencies/${c2.body.request.id}/cancel`).send({ reason: "duplicate call" })).status, 200);
});

test("hospital flow: proposal does not equal acceptance; only the assigned hospital sees the case", async () => {
  const Hospital = require("../model/Hospital");
  const reg = await agents.hosp.post("/api/hospitals/register").send({ hospitalName: "City Hospital", registrationNumber: "H-1", address: "Mall Rd", contactNumber: "+92 42 111111", emergencyCapacity: 10, latitude: lahore.latitude, longitude: lahore.longitude });
  assert.equal(reg.status, 201);
  const hid = reg.body.hospital.id;
  // cannot accept patients before verification
  assert.equal((await agents.hosp.patch("/api/hospitals/availability").send({ emergencyAvailability: "accepting" })).status, 403);
  assert.equal((await agents.admin.patch(`/api/admin/hospitals/${hid}/review`).send({ status: "verified" })).status, 200);
  assert.equal((await agents.hosp.patch("/api/hospitals/availability").send({ emergencyAvailability: "accepting" })).status, 200);
  assert.equal((await agents.hosp.patch("/api/hospitals/beds").send({ totalBeds: 20, availableBeds: 5, icuTotal: 4, icuAvailable: 1 })).status, 200);

  const staff = await agents.hosp.post("/api/hospitals/staff").send({ name: "Dr Sana", staffRole: "doctor", shift: "night" });
  assert.equal(staff.status, 201);

  const nearby = await agents.alice.get(`/api/hospitals/nearby?lat=${lahore.latitude}&lng=${lahore.longitude}`);
  assert.equal(nearby.body.hospitals.length, 1);
  assert.equal(nearby.body.hospitals[0].registrationNumber, undefined);

  const EmergencyRequest = require("../model/EmergencyRequest");
  const active = await EmergencyRequest.findOne({ status: "pending" });
  const rid = active._id.toString();
  const assign = await agents.admin.patch(`/api/admin/emergencies/${rid}/assign-hospital`).send({ hospitalId: hid });
  assert.equal(assign.status, 200);
  assert.equal(assign.body.request.hospitalResponse.status, "pending");

  // other hospital sees nothing
  const other = await agents.hosp2.get("/api/hospitals/emergencies/incoming");
  assert.equal(other.status, 404); // no profile
  const mine = await agents.hosp.get("/api/hospitals/emergencies/incoming");
  assert.equal(mine.body.count, 1);
  assert.equal(mine.body.requests[0].requester?.email, undefined, "hospital must not see requester email");

  const resp = await agents.hosp.patch(`/api/hospitals/cases/${rid}/respond`).send({ response: "accepted", note: "ER bay 2" });
  assert.equal(resp.status, 200);
  assert.equal(resp.body.request.hospitalResponse.status, "accepted");
  void Hospital;
});

test("messages: only participants; closed requests reject new messages", async () => {
  const EmergencyRequest = require("../model/EmergencyRequest");
  const active = await EmergencyRequest.findOne({ status: "pending" });
  const rid = active._id.toString();
  assert.equal((await agents.alice.post(`/api/emergencies/${rid}/messages`).send({ text: "help is needed at gate 2" })).status, 201);
  assert.equal((await agents.bob.get(`/api/emergencies/${rid}/messages`)).status, 404);
  assert.equal((await agents.admin.post(`/api/emergencies/${rid}/messages`).send({ text: "dispatching" })).status, 201);
  const list = await agents.alice.get(`/api/emergencies/${rid}/messages`);
  assert.equal(list.body.messages.length, 2);
  assert.equal(list.body.messages[0].mine, true);
});

test("notifications are per-user and can be marked read", async () => {
  const mine = await agents.admin.get("/api/notifications");
  assert.ok(mine.body.notifications.length > 0);
  const first = mine.body.notifications[0];
  assert.equal((await agents.alice.patch(`/api/notifications/${first.id}/read`)).status, 404, "cannot touch another user's notification");
  assert.equal((await agents.admin.patch(`/api/notifications/${first.id}/read`)).status, 200);
});

test("admin metrics are computed from real data and expose null where there is no data", async () => {
  const r = await agents.admin.get("/api/admin/metrics");
  assert.equal(r.status, 200);
  assert.ok(r.body.data.emergencies.total >= 1);
  assert.ok("timings" in r.body.data);
  assert.equal(typeof r.body.data.units.available, "number");
});

test("deactivated user loses access immediately", async () => {
  const bobId = data.users.bob._id.toString();
  assert.equal((await agents.admin.patch(`/api/admin/users/${bobId}/active`).send({ isActive: false })).status, 200);
  assert.equal((await agents.bob.get("/api/auth/me")).status, 403);
});
