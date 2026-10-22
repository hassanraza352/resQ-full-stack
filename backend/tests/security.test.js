/**
 * Auth / authorization tests that need NO database: the User model lookups are stubbed,
 * everything else (JWT verification, cookies, role middleware, CORS/origin guard, rate
 * limiting, validation-before-DB) is the real application code.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = "s".repeat(40);
process.env.MONGO_URI = "mongodb://unused";
process.env.CLIENT_ORIGIN = "http://localhost:5173";

const User = require("../model/User");
const createApp = require("../app");

const ids = {
  user: "507f1f77bcf86cd799439001",
  unit: "507f1f77bcf86cd799439002",
  hospital: "507f1f77bcf86cd799439003",
  admin: "507f1f77bcf86cd799439004",
  inactive: "507f1f77bcf86cd799439005",
};
const dbUsers = {
  [ids.user]: { _id: ids.user, role: "user", email: "u@x.com", name: "U", isActive: true },
  [ids.unit]: { _id: ids.unit, role: "unit", email: "n@x.com", name: "N", isActive: true },
  [ids.hospital]: { _id: ids.hospital, role: "hospital", email: "h@x.com", name: "H", isActive: true },
  [ids.admin]: { _id: ids.admin, role: "admin", email: "a@x.com", name: "A", isActive: true },
  [ids.inactive]: { _id: ids.inactive, role: "user", email: "i@x.com", name: "I", isActive: false },
};
// protect(): User.findById(id).select(...)
User.findById = (id) => ({ select: async () => dbUsers[String(id)] || null });

const sign = (id, role, opts = {}) =>
  jwt.sign({ id, role }, opts.secret || process.env.JWT_SECRET, { expiresIn: "1h", ...opts.sign });
const cookie = (t) => [`resq_token=${t}`];

const app = createApp();

/* --------------------------------------------------------------- session handling */
test("no cookie -> 401 on every protected area", async () => {
  for (const path of ["/api/auth/me", "/api/admin/metrics", "/api/units/me", "/api/hospitals/me", "/api/emergencies/my", "/api/notifications", "/api/messages/threads"]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401, path);
    assert.equal(res.body.success, false);
  }
});

test("garbage, forged, wrong-secret and alg=none tokens -> 401", async () => {
  const bad = [
    "not.a.jwt",
    sign(ids.admin, "admin", { secret: "attacker-secret-attacker-secret-attacker" }),
    // alg none
    `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ id: ids.admin, role: "admin" })).toString("base64url")}.`,
  ];
  for (const t of bad) {
    const res = await request(app).get("/api/admin/metrics").set("Cookie", cookie(t));
    assert.equal(res.status, 401);
  }
});

test("expired token -> 401 with 'expired' message and cookie cleared", async () => {
  const t = jwt.sign({ id: ids.user, role: "user" }, process.env.JWT_SECRET, { expiresIn: -10 });
  const res = await request(app).get("/api/auth/me").set("Cookie", cookie(t));
  assert.equal(res.status, 401);
  assert.match(res.body.message, /expired/i);
  assert.match(String(res.headers["set-cookie"]), /resq_token=;/);
});

test("token for a deleted account -> 401; deactivated account -> 403", async () => {
  const gone = sign("507f1f77bcf86cd7994390ff", "user");
  assert.equal((await request(app).get("/api/auth/me").set("Cookie", cookie(gone))).status, 401);
  const inactive = sign(ids.inactive, "user");
  assert.equal((await request(app).get("/api/auth/me").set("Cookie", cookie(inactive))).status, 403);
});

test("role claim inside the token is IGNORED: DB role wins", async () => {
  // token claims admin, but DB says this id is a plain user
  const t = sign(ids.user, "admin");
  const res = await request(app).get("/api/admin/metrics").set("Cookie", cookie(t));
  assert.equal(res.status, 403);
});

/* --------------------------------------------------------------- role matrix on EVERY route */
const routerOf = (file) => require(`../routes/${file}`);
const collect = (router) => {
  const out = [];
  for (const layer of router.stack) {
    if (layer.route) for (const m of Object.keys(layer.route.methods)) out.push({ method: m, path: layer.route.path });
  }
  return out;
};
const fill = (p) => p.replace(/:[A-Za-z]+/g, "507f1f77bcf86cd799439011");

const areas = [
  { name: "admin", file: "adminRoutes", prefix: "/api/admin", allowed: "admin" },
  { name: "units", file: "unitRoutes", prefix: "/api/units", allowed: "unit" },
  { name: "hospitals", file: "hospitalRoutes", prefix: "/api/hospitals", allowed: "hospital", skip: ["/nearby"] },
];

for (const a of areas) {
  test(`role matrix: ${a.prefix} rejects every other role (403) and anonymous (401)`, async () => {
    const routes = collect(routerOf(a.file)).filter((r) => !(a.skip || []).includes(r.path));
    assert.ok(routes.length >= 5, "route enumeration works");
    for (const r of routes) {
      const url = a.prefix + fill(r.path);
      const anon = await request(app)[r.method](url).send({});
      assert.equal(anon.status, 401, `anon ${r.method.toUpperCase()} ${url}`);
      for (const role of ["user", "unit", "hospital", "admin"].filter((x) => x !== a.allowed)) {
        const res = await request(app)[r.method](url).set("Cookie", cookie(sign(ids[role], role))).send({});
        assert.equal(res.status, 403, `${role} -> ${r.method.toUpperCase()} ${url} should be 403, got ${res.status}`);
      }
    }
  });
}

test("role matrix: user-only emergency endpoints reject unit/hospital/admin", async () => {
  const userOnly = [
    ["post", "/api/emergencies"],
    ["get", "/api/emergencies/my"],
    ["get", "/api/emergencies/nearby-units?lat=1&lng=1"],
    ["get", "/api/emergencies/507f1f77bcf86cd799439011"],
    ["patch", "/api/emergencies/507f1f77bcf86cd799439011/cancel"],
  ];
  for (const [m, url] of userOnly) {
    for (const role of ["unit", "hospital", "admin"]) {
      const res = await request(app)[m](url).set("Cookie", cookie(sign(ids[role], role))).send({});
      assert.equal(res.status, 403, `${role} ${m} ${url}`);
    }
  }
  // route/ETA is not available to hospitals
  const res = await request(app).get("/api/emergencies/507f1f77bcf86cd799439011/route").set("Cookie", cookie(sign(ids.hospital, "hospital")));
  assert.equal(res.status, 403);
});

/* --------------------------------------------------------------- registration */
test("registration: cannot self-register as admin or unknown role", async () => {
  for (const role of ["admin", "superuser", undefined, { $ne: "x" }]) {
    const res = await request(app).post("/api/auth/register").send({ name: "Mallory", email: "m@x.com", password: "longenough1", phone: "+92 300 1234567", role });
    assert.equal(res.status, 400, JSON.stringify(role));
  }
});

test("registration: input validation", async () => {
  const base = { name: "Ali", email: "ali@x.com", password: "longenough1", phone: "+92 300 1234567", role: "user" };
  const cases = [
    [{ ...base, email: "nope" }, /email/i],
    [{ ...base, password: "short" }, /password/i],
    [{ ...base, name: "" }, /name/i],
    [{ ...base, phone: "abc" }, /phone/i],
    [{ ...base, email: { $gt: "" } }, /email/i],
  ];
  for (const [body, rx] of cases) {
    const res = await request(app).post("/api/auth/register").send(body);
    assert.equal(res.status, 400);
    assert.match(res.body.message, rx);
  }
});

/* --------------------------------------------------------------- login */
test("login: correct password sets HttpOnly cookie, never leaks password/hash/token in body", async () => {
  const hash = await bcrypt.hash("CorrectHorse9", 4);
  const doc = { _id: ids.user, name: "U", email: "u@x.com", phone: "+92 300", role: "user", isVerified: false, isActive: true, password: hash };
  User.findOne = () => ({ select: async () => doc });

  const res = await request(app).post("/api/auth/login").send({ email: " U@X.com ", password: "CorrectHorse9", role: "user" });
  assert.equal(res.status, 200);
  const sc = String(res.headers["set-cookie"]);
  assert.match(sc, /resq_token=/);
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /SameSite=Lax/i);
  const body = JSON.stringify(res.body);
  assert.ok(!body.includes(hash) && !body.includes("CorrectHorse9") && !/token/i.test(body));
});

test("login: wrong password 401, wrong role 403, unknown email 401 (same message), deactivated 403", async () => {
  const hash = await bcrypt.hash("CorrectHorse9", 4);
  const doc = { _id: ids.user, name: "U", email: "u@x.com", role: "user", isActive: true, password: hash };
  User.findOne = () => ({ select: async () => doc });
  const wrongPw = await request(app).post("/api/auth/login").send({ email: "u@x.com", password: "WrongWrong1", role: "user" });
  assert.equal(wrongPw.status, 401);

  const wrongRole = await request(app).post("/api/auth/login").send({ email: "u@x.com", password: "CorrectHorse9", role: "admin" });
  assert.equal(wrongRole.status, 403);
  assert.equal(wrongRole.headers["set-cookie"], undefined, "no cookie on role mismatch");

  User.findOne = () => ({ select: async () => null });
  const unknown = await request(app).post("/api/auth/login").send({ email: "ghost@x.com", password: "Whatever123", role: "user" });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.message, wrongPw.body.message, "no user enumeration");

  User.findOne = () => ({ select: async () => ({ ...doc, isActive: false }) });
  const off = await request(app).post("/api/auth/login").send({ email: "u@x.com", password: "CorrectHorse9", role: "user" });
  assert.equal(off.status, 403);

  // operator injection in credentials must not reach the query
  const inj = await request(app).post("/api/auth/login").send({ email: { $ne: "" }, password: { $ne: "" }, role: "user" });
  assert.equal(inj.status, 400);
});

test("logout clears the cookie", async () => {
  const res = await request(app).post("/api/auth/logout");
  assert.equal(res.status, 200);
  assert.match(String(res.headers["set-cookie"]), /resq_token=;/);
});

/* --------------------------------------------------------------- CSRF / origin / body hardening */
test("origin guard: cross-site unsafe request is blocked, allowed origin passes", async () => {
  const evil = await request(app).post("/api/auth/logout").set("Origin", "https://evil.example");
  assert.equal(evil.status, 403);
  const good = await request(app).post("/api/auth/logout").set("Origin", "http://localhost:5173");
  assert.equal(good.status, 200);
});

test("origin guard: non-JSON body rejected (blocks HTML-form CSRF)", async () => {
  const res = await request(app).post("/api/auth/login").type("form").send("email=a@b.c&password=x&role=user");
  assert.equal(res.status, 415);
});

test("CORS: credentials allowed only for configured origin", async () => {
  const ok = await request(app).get("/api/health").set("Origin", "http://localhost:5173");
  assert.equal(ok.headers["access-control-allow-credentials"], "true");
  const bad = await request(app).get("/api/health").set("Origin", "https://evil.example");
  assert.equal(bad.headers["access-control-allow-origin"], undefined);
});

test("security headers present, x-powered-by hidden, malformed JSON -> 400, unknown route -> 404 JSON", async () => {
  const res = await request(app).get("/api/health");
  assert.ok(res.headers["x-content-type-options"]);
  assert.equal(res.headers["x-powered-by"], undefined);
  const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{oops");
  assert.equal(bad.status, 400);
  const nf = await request(app).get("/api/does-not-exist");
  assert.equal(nf.status, 404);
  assert.equal(nf.body.success, false);
});

/* --------------------------------------------------------------- validation happens BEFORE the database */
test("emergency creation: invalid input -> 400 (no DB needed to reject)", async () => {
  const t = cookie(sign(ids.user, "user"));
  const good = { emergencyType: "medical", contactNumber: "+92 300 1234567", address: "Main Blvd, Lahore", latitude: 31.52, longitude: 74.35 };
  const bads = [
    [{ ...good, emergencyType: "alien" }, /type/i],
    [{ ...good, contactNumber: "x" }, /contact/i],
    [{ ...good, address: "" }, /address/i],
    [{ ...good, latitude: 95 }, /location/i],
    [{ ...good, longitude: -181 }, /location/i],
    [{ ...good, latitude: "abc" }, /location/i],
    [{ ...good, latitude: undefined, longitude: undefined }, /location/i],
    [{ ...good, description: "x".repeat(1001) }, /description/i],
  ];
  for (const [b, rx] of bads) {
    const res = await request(app).post("/api/emergencies").set("Cookie", t).send(b);
    assert.equal(res.status, 400, JSON.stringify(b));
    assert.match(res.body.message, rx);
  }
});

test("nearby-units: invalid coordinates -> 400", async () => {
  const t = cookie(sign(ids.user, "user"));
  for (const q of ["", "?lat=abc&lng=1", "?lat=91&lng=1", "?lat=1", "?lat=1&lng=181"]) {
    const res = await request(app).get(`/api/emergencies/nearby-units${q}`).set("Cookie", t);
    assert.equal(res.status, 400, q);
  }
});

test("unit location: invalid coordinates -> 400 before touching DB", async () => {
  const t = cookie(sign(ids.unit, "unit"));
  for (const b of [{}, { latitude: 100, longitude: 0 }, { latitude: "x", longitude: 1 }]) {
    const res = await request(app).patch("/api/units/location").set("Cookie", t).send(b);
    assert.equal(res.status, 400);
  }
});

test("admin: malformed ids rejected with 400, bad enum rejected", async () => {
  const t = cookie(sign(ids.admin, "admin"));
  assert.equal((await request(app).patch("/api/admin/emergencies/not-an-id/assign").set("Cookie", t).send({ unitId: "x" })).status, 400);
  assert.equal((await request(app).patch("/api/admin/emergencies/507f1f77bcf86cd799439011/assign").set("Cookie", t).send({ unitId: { $ne: null } })).status, 400);
  assert.equal((await request(app).patch("/api/admin/emergencies/507f1f77bcf86cd799439011/priority").set("Cookie", t).send({ priority: "panic" })).status, 400);
  assert.equal((await request(app).patch("/api/admin/units/507f1f77bcf86cd799439011/review").set("Cookie", t).send({ status: "pending" })).status, 400);
  assert.equal((await request(app).patch("/api/admin/users/507f1f77bcf86cd799439004/active").set("Cookie", t).send({ isActive: "no" })).status, 400);
  assert.equal((await request(app).patch(`/api/admin/users/${ids.admin}/active`).set("Cookie", t).send({ isActive: false })).status, 400, "admin cannot deactivate self");
});

test("hospital: bed validation (available > total) rejected", async () => {
  // needs a hospital doc; stub it
  const Hospital = require("../model/Hospital");
  Hospital.findOne = async () => ({ verificationStatus: "verified", staff: [], save: async () => {} });
  const t = cookie(sign(ids.hospital, "hospital"));
  const res = await request(app).patch("/api/hospitals/beds").set("Cookie", t).send({ totalBeds: 10, availableBeds: 11 });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /exceed/i);
});

test("unit: cannot go on duty while unverified (stubbed unit)", async () => {
  const Unit = require("../model/Unit");
  Unit.findOne = async () => ({ verificationStatus: "pending", availability: "offline", location: {} });
  const t = cookie(sign(ids.unit, "unit"));
  const res = await request(app).patch("/api/units/availability").set("Cookie", t).send({ availability: "available" });
  assert.equal(res.status, 403);
});

/* --------------------------------------------------------------- rate limiting (keep LAST: it consumes the budget) */
test("login is rate limited (429 after repeated attempts)", async () => {
  User.findOne = () => ({ select: async () => null });
  let last;
  for (let i = 0; i < 25; i++) {
    last = await request(app).post("/api/auth/login").send({ email: "x@x.com", password: "Whatever123", role: "user" });
  }
  assert.equal(last.status, 429);
  assert.equal(last.body.success, false);
});
