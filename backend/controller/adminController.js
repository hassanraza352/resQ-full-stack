const User = require("../model/User");
const Unit = require("../model/Unit");
const Hospital = require("../model/Hospital");
const EmergencyRequest = require("../model/EmergencyRequest");
const { HttpError, ok, wrap, paginate, pageMeta } = require("../utils/response");
const v = require("../utils/validate");
const { fromCoordinates } = require("../utils/geo");
const { ACTIVE_STATUSES, UNIT_COMMITTED_STATUSES, STATUSES } = require("../utils/stateMachine");
const { historyEntry, releaseUnitIfFree } = require("../services/requestService");
const { requestView, unitView, hospitalView } = require("../services/serialize");
const { notifyUsers, broadcastRequestChange } = require("../services/notify");
const { parseNearbyQuery, findUnitsNear, attachRoutes } = require("../services/dispatch");
const { computeTimings } = require("../services/metrics");
const { load } = require("../config/env");
const sockets = require("../socket");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const POPULATE = [
  { path: "requester", select: "name email phone" },
  { path: "assignedUnit" },
  { path: "assignedHospital" },
];

/* ------------------------------------------------------------------ roles & verification */
const assignRole = (role) =>
  wrap(async (req, res) => {
    const user = await User.findById(v.objectId(req.params.userId, "User ID"));
    if (!user) throw new HttpError(404, "User not found");
    if (user.role === role) throw new HttpError(409, `This account already has the ${role} role`);
    if (user.role !== "user") throw new HttpError(400, `Only regular user accounts can be assigned the ${role} role`);
    user.role = role;
    await user.save();
    return ok(res, {
      message: `${role === "unit" ? "Unit" : "Hospital"} role assigned successfully`,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  });
const assignUnitRole = assignRole("unit");
const assignHospitalRole = assignRole("hospital");

const review = (Model, label, idParam, field = "user") =>
  wrap(async (req, res) => {
    const status = v.oneOf(req.body?.status, ["verified", "rejected"], "Status");
    const doc = await Model.findById(v.objectId(req.params[idParam], `${label} ID`));
    if (!doc) throw new HttpError(404, `${label} not found`);
    if (doc.verificationStatus !== "pending") throw new HttpError(409, `This ${label.toLowerCase()} has already been reviewed`);
    doc.verificationStatus = status;
    if (Model === Unit) doc.availability = "offline"; // goes on duty only when the unit chooses to
    if (Model === Hospital) doc.emergencyAvailability = "not-accepting";
    await doc.save();
    await User.updateOne({ _id: doc[field] }, { $set: { isVerified: status === "verified" } });
    notifyUsers([doc[field]], {
      type: "verification",
      title: `${label} registration ${status}`,
      body: status === "verified" ? "You can now go on duty." : "Please contact support for details.",
    }).catch(() => {});
    return ok(res, { message: `${label} ${status} successfully`, [label.toLowerCase()]: doc });
  });
const reviewUnit = review(Unit, "Unit", "unitId");
const reviewHospital = review(Hospital, "Hospital", "hospitalId");

const getPendingUnits = wrap(async (req, res) => {
  const units = await Unit.find({ verificationStatus: "pending" }).populate("user", "name email phone").sort({ createdAt: -1 });
  return ok(res, { count: units.length, units });
});
const getPendingHospitals = wrap(async (req, res) => {
  const hospitals = await Hospital.find({ verificationStatus: "pending" }).populate("user", "name email phone").sort({ createdAt: -1 });
  return ok(res, { count: hospitals.length, hospitals });
});

/* ------------------------------------------------------------------ management lists */
const listUsers = wrap(async (req, res) => {
  const p = paginate(req.query, { defaultLimit: 20 });
  const filter = {};
  if (req.query.role) filter.role = v.oneOf(String(req.query.role), ["user", "unit", "hospital", "admin"], "role");
  if (req.query.active === "true") filter.isActive = { $ne: false };
  if (req.query.active === "false") filter.isActive = false;
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 60)), "i");
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [rows, total] = await Promise.all([
    User.find(filter).select("name email phone role isVerified isActive createdAt").sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
    User.countDocuments(filter),
  ]);
  return ok(res, { count: rows.length, users: rows, meta: pageMeta(p, total) });
});

const setUserActive = wrap(async (req, res) => {
  if (typeof req.body?.isActive !== "boolean") throw new HttpError(400, "isActive (boolean) is required");
  const id = v.objectId(req.params.userId, "User ID");
  if (id === req.user.id) throw new HttpError(400, "You cannot change your own active state");
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, "User not found");
  user.isActive = req.body.isActive;
  await user.save();
  if (!user.isActive && user.role === "unit") {
    await Unit.updateOne({ user: user._id, availability: "available" }, { $set: { availability: "offline" } });
  }
  return ok(res, { message: user.isActive ? "Account activated" : "Account deactivated", user: { id: user._id, isActive: user.isActive } });
});

const listUnits = wrap(async (req, res) => {
  const p = paginate(req.query, { defaultLimit: 20 });
  const filter = {};
  if (req.query.verification) filter.verificationStatus = v.oneOf(String(req.query.verification), ["pending", "verified", "rejected"], "verification");
  if (req.query.availability) filter.availability = v.oneOf(String(req.query.availability), ["available", "busy", "offline"], "availability");
  const [rows, total] = await Promise.all([
    Unit.find(filter).populate("user", "name email phone").sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
    Unit.countDocuments(filter),
  ]);
  return ok(res, {
    count: rows.length,
    units: rows.map((u) => ({ ...unitView(u, { exact: true, includeContact: true, includePlate: true }), user: u.user, createdAt: u.createdAt })),
    meta: pageMeta(p, total),
  });
});

const listHospitals = wrap(async (req, res) => {
  const p = paginate(req.query, { defaultLimit: 20 });
  const filter = {};
  if (req.query.verification) filter.verificationStatus = v.oneOf(String(req.query.verification), ["pending", "verified", "rejected"], "verification");
  const [rows, total] = await Promise.all([
    Hospital.find(filter).populate("user", "name email phone").sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
    Hospital.countDocuments(filter),
  ]);
  return ok(res, {
    count: rows.length,
    hospitals: rows.map((h) => ({ ...hospitalView(h, { includePrivate: true }), user: h.user, staffCount: h.staff.length })),
    meta: pageMeta(p, total),
  });
});

const getAvailableHospitals = wrap(async (req, res) => {
  const hospitals = await Hospital.find({ verificationStatus: "verified", emergencyAvailability: "accepting" }).sort({ hospitalName: 1 });
  const views = hospitals.map((h) => hospitalView(h, { includePrivate: true }));
  return ok(res, { count: views.length, data: views, hospitals: views });
});

/* ------------------------------------------------------------------ incidents */
const listEmergencies = wrap(async (req, res) => {
  const p = paginate(req.query, { defaultLimit: 20 });
  const q = req.query;
  const filter = {};
  if (q.status) {
    const list = String(q.status).split(",").filter((s) => STATUSES.includes(s));
    if (list.length) filter.status = { $in: list };
  } else if (q.scope === "active") filter.status = { $in: ACTIVE_STATUSES };
  if (q.emergencyType) filter.emergencyType = String(q.emergencyType);
  if (q.priority) filter.priority = String(q.priority);
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from && !Number.isNaN(Date.parse(q.from))) filter.createdAt.$gte = new Date(q.from);
    if (q.to && !Number.isNaN(Date.parse(q.to))) filter.createdAt.$lte = new Date(q.to);
  }
  if (q.q) {
    const rx = new RegExp(escapeRegex(String(q.q).slice(0, 60)), "i");
    filter.$or = [{ referenceId: rx }, { "location.address": rx }];
  }
  const priorityFirst = q.sort === "priority";
  const rows = await EmergencyRequest.find(filter)
    .populate(POPULATE)
    .sort(priorityFirst ? { priority: 1, createdAt: 1 } : { createdAt: q.order === "asc" ? 1 : -1 })
    .skip(p.skip)
    .limit(p.limit);
  const total = await EmergencyRequest.countDocuments(filter);
  return ok(res, { count: rows.length, requests: rows.map((r) => requestView(r, "admin")), meta: pageMeta(p, total) });
});

// kept for backward compatibility
const getPendingEmergencies = wrap(async (req, res) => {
  const rows = await EmergencyRequest.find({ status: "pending" }).populate(POPULATE).sort({ createdAt: 1 });
  return ok(res, { count: rows.length, requests: rows.map((r) => requestView(r, "admin")) });
});

const getEmergency = wrap(async (req, res) => {
  const r = await EmergencyRequest.findById(v.objectId(req.params.requestId, "Request ID")).populate(POPULATE);
  if (!r) throw new HttpError(404, "Emergency request not found");
  return ok(res, { request: requestView(r, "admin") });
});

/**
 * Candidate units for a request: verified units near the incident with straight-line
 * distance (discovery) and route-based road distance/ETA when the routing service answers.
 */
const getCandidates = wrap(async (req, res) => {
  const r = await EmergencyRequest.findById(v.objectId(req.params.requestId, "Request ID"));
  if (!r) throw new HttpError(404, "Emergency request not found");
  if (!["pending", "assigned"].includes(r.status)) throw new HttpError(409, `Request is ${r.status}; units can only be chosen while pending or assigned`);

  const inc = fromCoordinates(r.location.coordinates);
  const q = parseNearbyQuery({ ...req.query, lat: inc.latitude, lng: inc.longitude }, { defaultLimit: 15, maxLimit: 30 });
  const includeStale = req.query.includeStale === "true";
  const rows = await findUnitsNear({
    ...q,
    availability: ["available", "busy"],
    includeStale: true, // fetched, then flagged below so dispatch can SEE why a unit is not eligible
  });

  const ids = rows.map((u) => u._id);
  const busyWith = await EmergencyRequest.find({ assignedUnit: { $in: ids }, status: { $in: UNIT_COMMITTED_STATUSES } }).select("assignedUnit referenceId status");
  const busyMap = new Map(busyWith.map((b) => [b.assignedUnit.toString(), b]));
  const rejected = new Set((r.rejectedUnits || []).map(String));
  const cutoff = Date.now() - load().unitLocationMaxAgeMin * 60 * 1000;

  const shaped = rows.map((u) => {
    const fresh = u.locationUpdatedAt && new Date(u.locationUpdatedAt).getTime() >= cutoff;
    const current = busyMap.get(u._id.toString());
    const eligible = u.availability === "available" && !!fresh;
    return { raw: u, fresh: !!fresh, current, eligible };
  });
  const visible = includeStale ? shaped : shaped.filter((s) => s.fresh || s.raw.availability === "busy");
  const withRoads = await attachRoutes(visible.map((s) => s.raw), inc, 6);

  const candidates = withRoads.map((u, i) => ({
    ...unitView(u, { exact: true, includeContact: true, includePlate: true }),
    straightLineKm: Math.round((u.distanceMeters / 1000) * 10) / 10,
    road: u.road,
    eligible: visible[i].eligible,
    ineligibleReason: visible[i].eligible
      ? null
      : u.availability === "busy"
      ? "Already assigned"
      : "Position is stale (no recent GPS update)",
    currentAssignment: visible[i].current ? { requestId: visible[i].current._id, referenceId: visible[i].current.referenceId, status: visible[i].current.status } : null,
    previouslyRejected: rejected.has(u._id.toString()),
    isCurrentlyAssignedToThisRequest: r.assignedUnit?.toString() === u._id.toString(),
  }));

  const eligibleCount = candidates.filter((c) => c.eligible).length;
  return ok(res, {
    incident: { ...inc, address: r.location.address },
    candidates,
    meta: { radiusKm: q.radiusKm, eligibleCount },
    warning: eligibleCount === 0 ? `No eligible unit within ${q.radiusKm} km. Widen the search radius or escalate through your emergency procedure.` : null,
    routing: { available: candidates.some((c) => c.road), kind: "route-estimate (no live traffic)" },
  });
});

/**
 * Shared by assign + reassign. Concurrency design (no multi-doc transaction needed):
 *   1. atomically flip the NEW unit available -> busy (only one caller can win)
 *   2. compare-and-set the request on its expected status/unit
 *   3. on any failure release the reservation
 */
const doAssign = async (req, { reassign }) => {
  const unitId = v.objectId(req.body?.unitId, "Unit ID");
  const note = v.optString(req.body?.note, "Note", { max: 500 });
  const requestId = v.objectId(req.params.requestId, "Request ID");

  const current = await EmergencyRequest.findById(requestId);
  if (!current) throw new HttpError(404, "Emergency request not found");
  const expected = reassign ? "assigned" : "pending";
  if (current.status !== expected) {
    throw new HttpError(409, reassign ? "Only an assignment the unit has not accepted yet can be reassigned" : "Only pending requests can be assigned", { currentStatus: current.status });
  }
  if (reassign && current.assignedUnit?.toString() === unitId) throw new HttpError(400, "This unit is already assigned");

  const unit = await Unit.findOneAndUpdate(
    { _id: unitId, verificationStatus: "verified", availability: "available" },
    { $set: { availability: "busy" } },
    { new: true }
  );
  if (!unit) throw new HttpError(409, "Unit not found, not verified, or no longer available");

  let updated;
  try {
    updated = await EmergencyRequest.findOneAndUpdate(
      { _id: requestId, status: expected, assignedUnit: reassign ? current.assignedUnit : null },
      {
        $set: { assignedUnit: unit._id, status: "assigned", assignedAt: new Date(), assignedBy: req.user.id },
        $push: {
          statusHistory: historyEntry({ status: "assigned", by: req.user.id, byRole: "admin", note: reassign ? `Reassigned${note ? `: ${note}` : ""}` : note || "Unit assigned" }),
          assignmentHistory: { unit: unit._id, action: reassign ? "reassigned" : "assigned", by: req.user.id, byRole: "admin", note, at: new Date() },
        },
      },
      { new: true }
    ).populate(POPULATE);
  } catch (e) {
    await Unit.updateOne({ _id: unit._id, availability: "busy" }, { $set: { availability: "available" } });
    throw e;
  }
  if (!updated) {
    await Unit.updateOne({ _id: unit._id, availability: "busy" }, { $set: { availability: "available" } });
    throw new HttpError(409, "This request was changed by someone else. Refresh and try again.");
  }

  if (reassign && current.assignedUnit) {
    await releaseUnitIfFree(current.assignedUnit, updated._id);
    const oldUnit = await Unit.findById(current.assignedUnit).select("user");
    if (oldUnit) notifyUsers([oldUnit.user], { type: "assignment", title: "Assignment withdrawn", body: updated.referenceId, request: updated._id }).catch(() => {});
  }
  sockets.toUser(unit.user.toString(), "assignment:new", { requestId: updated._id.toString(), referenceId: updated.referenceId });
  notifyUsers([unit.user], { type: "assignment", title: "New emergency assignment", body: `${updated.referenceId} · ${updated.location.address}`, request: updated._id }).catch(() => {});
  notifyUsers([updated.requester._id], { type: "request-status", title: "A unit has been assigned", body: `${updated.referenceId} · awaiting unit acceptance`, request: updated._id }).catch(() => {});
  await broadcastRequestChange(updated);
  return updated;
};

const assignUnitToEmergency = wrap(async (req, res) => {
  const updated = await doAssign(req, { reassign: false });
  return ok(res, { message: "Unit assigned. Waiting for the unit to accept.", request: requestView(updated, "admin") });
});
const reassignUnit = wrap(async (req, res) => {
  const updated = await doAssign(req, { reassign: true });
  return ok(res, { message: "Assignment moved to the new unit.", request: requestView(updated, "admin") });
});

const closeRequest = (status) =>
  wrap(async (req, res) => {
    const reason = v.reqString(req.body?.reason, "Reason", { min: 3, max: 500 });
    const from = status === "rejected" ? ["pending"] : ACTIVE_STATUSES;
    const current = await EmergencyRequest.findById(v.objectId(req.params.requestId, "Request ID"));
    if (!current) throw new HttpError(404, "Emergency request not found");
    if (!from.includes(current.status)) throw new HttpError(409, `A ${current.status} request cannot be ${status}`, { currentStatus: current.status });

    const updated = await EmergencyRequest.findOneAndUpdate(
      { _id: current._id, status: current.status },
      {
        $set: { status, cancelReason: reason, ...(status === "cancelled" ? { cancelledAt: new Date() } : {}) },
        $push: {
          statusHistory: historyEntry({ status, by: req.user.id, byRole: "admin", note: reason }),
          ...(current.assignedUnit ? { assignmentHistory: { unit: current.assignedUnit, action: "released", by: req.user.id, byRole: "admin", note: reason, at: new Date() } } : {}),
        },
      },
      { new: true }
    ).populate(POPULATE);
    if (!updated) throw new HttpError(409, "Request changed. Refresh and try again.");

    if (current.assignedUnit) {
      await releaseUnitIfFree(current.assignedUnit, updated._id);
      const u = await Unit.findById(current.assignedUnit).select("user");
      if (u) notifyUsers([u.user], { type: "request-status", title: `Request ${status} by dispatch`, body: updated.referenceId, request: updated._id }).catch(() => {});
    }
    notifyUsers([updated.requester._id], { type: "request-status", title: `Your request was ${status}`, body: `${updated.referenceId} · ${reason}`, request: updated._id }).catch(() => {});
    await broadcastRequestChange(updated);
    return ok(res, { message: `Request ${status}`, request: requestView(updated, "admin") });
  });
const cancelEmergency = closeRequest("cancelled");
const rejectEmergency = closeRequest("rejected");

// Escalate / de-escalate
const setPriority = wrap(async (req, res) => {
  const priority = v.oneOf(req.body?.priority, ["low", "normal", "high", "critical"], "Priority");
  const current = await EmergencyRequest.findOne({ _id: v.objectId(req.params.requestId, "Request ID"), status: { $in: ACTIVE_STATUSES } });
  if (!current) throw new HttpError(404, "Active emergency request not found");
  const updated = await EmergencyRequest.findOneAndUpdate(
    { _id: current._id, status: { $in: ACTIVE_STATUSES } },
    { $set: { priority }, $push: { statusHistory: historyEntry({ status: current.status, by: req.user.id, byRole: "admin", note: `Priority set to ${priority}` }) } },
    { new: true }
  ).populate(POPULATE);
  if (!updated) throw new HttpError(409, "Request changed. Refresh and try again.");
  await broadcastRequestChange(updated);
  return ok(res, { message: `Priority set to ${priority}`, request: requestView(updated, "admin") });
});

const assignHospitalToEmergency = wrap(async (req, res) => {
  const hospital = await Hospital.findById(v.objectId(req.body?.hospitalId, "Hospital ID"));
  if (!hospital) throw new HttpError(404, "Hospital not found");
  if (hospital.verificationStatus !== "verified") throw new HttpError(400, "Only verified hospitals can be assigned");
  if (hospital.emergencyAvailability !== "accepting") throw new HttpError(400, "Hospital is not accepting emergencies");

  const current = await EmergencyRequest.findOne({ _id: v.objectId(req.params.requestId, "Request ID"), status: { $in: ACTIVE_STATUSES } });
  if (!current) throw new HttpError(404, "Active emergency request not found");

  // Proposing a hospital does NOT mean it accepted: hospitalResponse starts as "pending".
  const updated = await EmergencyRequest.findOneAndUpdate(
    { _id: current._id, status: { $in: ACTIVE_STATUSES } },
    {
      $set: { assignedHospital: hospital._id, hospitalResponse: { status: "pending", respondedAt: null, note: "" } },
      $push: { statusHistory: historyEntry({ status: current.status, by: req.user.id, byRole: "admin", note: `Hospital proposed: ${hospital.hospitalName}` }) },
    },
    { new: true }
  ).populate(POPULATE);
  if (!updated) throw new HttpError(409, "Request changed. Refresh and try again.");

  notifyUsers([hospital.user], { type: "hospital-case", title: "Incoming emergency case", body: `${updated.referenceId} · ${updated.emergencyType}`, request: updated._id }).catch(() => {});
  await broadcastRequestChange(updated);
  return ok(res, { message: "Hospital assigned. Waiting for the hospital to accept.", data: requestView(updated, "admin"), request: requestView(updated, "admin") });
});

/* ------------------------------------------------------------------ metrics & reports */
const buildStats = async () => {
  const [
    usersByRole,
    unitsTotal, unitsVerified, unitsPending, unitsAvailable, unitsBusy, unitsOffline,
    hospTotal, hospVerified, hospPending, hospAccepting,
    reqTotal, reqPending, reqActive, reqCompleted, reqCancelled,
    timingRows,
  ] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
    Unit.countDocuments(),
    Unit.countDocuments({ verificationStatus: "verified" }),
    Unit.countDocuments({ verificationStatus: "pending" }),
    Unit.countDocuments({ verificationStatus: "verified", availability: "available" }),
    Unit.countDocuments({ verificationStatus: "verified", availability: "busy" }),
    Unit.countDocuments({ verificationStatus: "verified", availability: "offline" }),
    Hospital.countDocuments(),
    Hospital.countDocuments({ verificationStatus: "verified" }),
    Hospital.countDocuments({ verificationStatus: "pending" }),
    Hospital.countDocuments({ verificationStatus: "verified", emergencyAvailability: "accepting" }),
    EmergencyRequest.countDocuments(),
    EmergencyRequest.countDocuments({ status: "pending" }),
    EmergencyRequest.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
    EmergencyRequest.countDocuments({ status: "completed" }),
    EmergencyRequest.countDocuments({ status: "cancelled" }),
    EmergencyRequest.find({ assignedAt: { $ne: null } }).sort({ createdAt: -1 }).limit(500).select("createdAt assignedAt statusHistory").lean(),
  ]);
  const roles = Object.fromEntries(usersByRole.map((r) => [r._id, r.n]));
  const data = {
    users: { total: roles.user || 0, byRole: roles },
    units: { total: unitsTotal, verified: unitsVerified, pending: unitsPending, available: unitsAvailable, assigned: unitsBusy, offline: unitsOffline },
    hospitals: { total: hospTotal, verified: hospVerified, pending: hospPending, accepting: hospAccepting },
    emergencies: { total: reqTotal, pending: reqPending, active: reqActive, completed: reqCompleted, cancelled: reqCancelled },
    timings: computeTimings(timingRows),
    generatedAt: new Date().toISOString(),
  };
  return data;
};

const getDashboardStats = wrap(async (req, res) => ok(res, { data: await buildStats() }));

const getReports = wrap(async (req, res) => {
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const since = new Date(Date.now() - days * 86400000);
  const match = { createdAt: { $gte: since } };
  const [byType, byStatus, perDay, byPriority, timingRows, hospitalResp] = await Promise.all([
    EmergencyRequest.aggregate([{ $match: match }, { $group: { _id: "$emergencyType", n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    EmergencyRequest.aggregate([{ $match: match }, { $group: { _id: "$status", n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    EmergencyRequest.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    EmergencyRequest.aggregate([{ $match: match }, { $group: { _id: "$priority", n: { $sum: 1 } } }]),
    EmergencyRequest.find({ ...match, assignedAt: { $ne: null } }).limit(2000).select("createdAt assignedAt statusHistory").lean(),
    EmergencyRequest.aggregate([{ $match: { ...match, assignedHospital: { $ne: null } } }, { $group: { _id: "$hospitalResponse.status", n: { $sum: 1 } } }]),
  ]);
  const shape = (rows) => rows.map((r) => ({ key: r._id, count: r.n }));
  return ok(res, {
    data: {
      rangeDays: days,
      since,
      byType: shape(byType),
      byStatus: shape(byStatus),
      byPriority: shape(byPriority),
      perDay: shape(perDay),
      hospitalResponses: shape(hospitalResp),
      timings: computeTimings(timingRows),
    },
  });
});

// keeps the original /dashboard contract (message + admin) and adds live stats
const getDashboard = wrap(async (req, res) =>
  ok(res, { message: "Welcome to the ResQ Admin Dashboard", admin: req.user, data: await buildStats() })
);

module.exports = {
  assignUnitRole, getPendingUnits, reviewUnit, assignHospitalRole, getPendingHospitals, reviewHospital,
  getPendingEmergencies, assignUnitToEmergency, reassignUnit, assignHospitalToEmergency, getAvailableHospitals,
  getDashboardStats, getDashboard, getReports,
  listUsers, setUserActive, listUnits, listHospitals,
  listEmergencies, getEmergency, getCandidates, cancelEmergency, rejectEmergency, setPriority,
};
