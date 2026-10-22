const Unit = require("../model/Unit");
const EmergencyRequest = require("../model/EmergencyRequest");
const { HttpError, ok, wrap, paginate, pageMeta } = require("../utils/response");
const v = require("../utils/validate");
const { parseLatLng, toGeoPoint } = require("../utils/geo");
const { UNIT_COMMITTED_STATUSES, canTransition } = require("../utils/stateMachine");
const { historyEntry, releaseUnitIfFree } = require("../services/requestService");
const { requestView, unitView } = require("../services/serialize");
const { notifyAdmins, notifyUsers, broadcastRequestChange } = require("../services/notify");
const sockets = require("../socket");

const VEHICLE_TYPES = ["basic", "advanced", "patient-transport"];

const getUnitOr404 = async (userId) => {
  const unit = await Unit.findOne({ user: userId });
  if (!unit) throw new HttpError(404, "No unit is registered for this account");
  return unit;
};

// The unit's own profile: exact position + identifiers, same shape the UI uses everywhere.
const ownUnitView = (u) => ({
  ...unitView(u, { exact: true, includeContact: true, includePlate: true }),
  createdAt: u.createdAt,
});

const registerUnit = wrap(async (req, res) => {
  const b = req.body || {};
  const registrationNumber = v.reqString(b.registrationNumber, "Registration number", { min: 3, max: 20 }).toUpperCase();
  const vehicleModel = v.reqString(b.vehicleModel, "Vehicle model", { max: 80 });
  const vehicleType = v.oneOf(b.vehicleType, VEHICLE_TYPES, "Vehicle type");
  const contactNumber = v.phone(b.contactNumber, "Contact number");
  const capacity = v.int(b.capacity, "Capacity", { min: 1, max: 20 });

  if (await Unit.exists({ user: req.user.id })) throw new HttpError(409, "A unit is already registered for this account");
  if (await Unit.exists({ registrationNumber })) throw new HttpError(409, "This vehicle is already registered");

  const unit = await Unit.create({
    user: req.user.id,
    registrationNumber,
    vehicleModel,
    vehicleType,
    contactNumber,
    capacity,
    availability: "offline", // always starts offline + pending, regardless of what the client sends
    verificationStatus: "pending",
  });

  notifyAdmins({ type: "verification", title: "New unit awaiting verification", body: `${registrationNumber} (${vehicleType})` }).catch(() => {});
  return ok(res, { message: "Unit registered and awaiting admin verification", unit: ownUnitView(unit) }, 201);
});

const getMyUnit = wrap(async (req, res) => ok(res, { unit: ownUnitView(await getUnitOr404(req.user.id)) }));

// Unit may update only its contact number (identity fields are admin-verified).
const updateMyUnit = wrap(async (req, res) => {
  const unit = await getUnitOr404(req.user.id);
  if (req.body?.contactNumber === undefined) throw new HttpError(400, "Nothing to update");
  unit.contactNumber = v.phone(req.body.contactNumber, "Contact number");
  await unit.save();
  return ok(res, { message: "Unit updated", unit: ownUnitView(unit) });
});

const updateUnitAvailability = wrap(async (req, res) => {
  const availability = v.oneOf(req.body?.availability, ["available", "offline"], "Availability");
  const unit = await getUnitOr404(req.user.id);
  if (unit.verificationStatus !== "verified") throw new HttpError(403, "Your unit must be verified by an admin first");
  if (unit.availability === "busy") throw new HttpError(409, "A unit with an active assignment cannot change its availability");
  if (availability === "available" && !unit.location?.coordinates?.length) {
    throw new HttpError(400, "Share your location before going on duty so dispatch can find you");
  }

  // Conditional update: never overwrite "busy" that an admin assignment may have just set.
  const updated = await Unit.findOneAndUpdate(
    { _id: unit._id, availability: { $ne: "busy" } },
    { $set: { availability } },
    { new: true }
  );
  if (!updated) throw new HttpError(409, "Unit just received an assignment. Refresh and try again.");
  return ok(res, { message: "Unit availability updated", unit: ownUnitView(updated) });
});

/**
 * Periodic GPS ping from the unit's own device. Only the LATEST point is stored.
 * Allowed while on duty (available/busy). Going offline stops sharing - unless the unit
 * is busy, in which case sharing continues because the requester is tracking it.
 */
const updateUnitLocation = wrap(async (req, res) => {
  const pos = parseLatLng(req.body?.latitude, req.body?.longitude);
  if (!pos) throw new HttpError(400, "Valid latitude and longitude are required");
  const accuracy = typeof req.body?.accuracy === "number" && req.body.accuracy >= 0 ? Math.round(req.body.accuracy) : null;

  const unit = await Unit.findOne({ user: req.user.id }).select("verificationStatus availability");
  if (!unit) throw new HttpError(404, "Unit profile not found");
  if (unit.verificationStatus !== "verified") throw new HttpError(403, "Only verified units can share location");

  // A unit that is offline may still send ONE position so it can go on duty (needs coordinates).
  const updated = await Unit.findByIdAndUpdate(
    unit._id,
    { $set: { location: toGeoPoint(pos.latitude, pos.longitude), locationUpdatedAt: new Date(), locationAccuracy: accuracy } },
    { new: true }
  );

  // Push to the active request's room so the requester/admin map moves (no personal data).
  const active = await EmergencyRequest.findOne({
    assignedUnit: unit._id,
    status: { $in: ["accepted", "en-route", "arrived", "in-progress"] },
  }).select("_id");
  if (active) {
    sockets.toRequest(active._id.toString(), "unit:location", {
      requestId: active._id.toString(),
      latitude: pos.latitude,
      longitude: pos.longitude,
      accuracy,
      updatedAt: updated.locationUpdatedAt,
    });
  }
  return ok(res, { message: "Location updated", updatedAt: updated.locationUpdatedAt });
});

// Active assignments for this unit (never other units' requests)
const getMyAssignedEmergencies = wrap(async (req, res) => {
  const unit = await getUnitOr404(req.user.id);
  const requests = await EmergencyRequest.find({ assignedUnit: unit._id, status: { $in: UNIT_COMMITTED_STATUSES } })
    .populate("requester", "name phone")
    .populate("assignedUnit")
    .populate("assignedHospital")
    .sort({ updatedAt: -1 });
  return ok(res, { count: requests.length, requests: requests.map((r) => requestView(r, "unit")) });
});

const getMyHistory = wrap(async (req, res) => {
  const unit = await getUnitOr404(req.user.id);
  const p = paginate(req.query, { defaultLimit: 20 });
  const filter = { assignedUnit: unit._id, status: { $in: ["completed", "cancelled"] } };
  const [rows, total] = await Promise.all([
    EmergencyRequest.find(filter).populate("requester", "name phone").sort({ updatedAt: -1 }).skip(p.skip).limit(p.limit),
    EmergencyRequest.countDocuments(filter),
  ]);
  return ok(res, { count: rows.length, requests: rows.map((r) => requestView(r, "unit")), meta: pageMeta(p, total) });
});

/** Unit status updates. Only valid transitions for the `unit` role (see utils/stateMachine). */
const updateEmergencyStatus = wrap(async (req, res) => {
  const status = req.body?.status;
  const unit = await getUnitOr404(req.user.id);

  const request = await EmergencyRequest.findOne({ _id: req.params.requestId, assignedUnit: unit._id });
  if (!request) throw new HttpError(404, "Assigned emergency request not found"); // also hides other units' requests

  if (typeof status !== "string" || status === "pending" || !canTransition(request.status, status, "unit")) {
    throw new HttpError(400, "Invalid status transition", { currentStatus: request.status });
  }

  const set = { status };
  if (status === "completed") set.completedAt = new Date();

  // compare-and-set on the previous status => no double transitions / races
  const updated = await EmergencyRequest.findOneAndUpdate(
    { _id: request._id, assignedUnit: unit._id, status: request.status },
    { $set: set, $push: { statusHistory: historyEntry({ status, by: req.user.id, byRole: "unit" }) } },
    { new: true }
  )
    .populate("requester", "name phone")
    .populate("assignedUnit")
    .populate("assignedHospital");
  if (!updated) throw new HttpError(409, "Request status changed. Refresh and try again.");

  if (status === "completed") await releaseUnitIfFree(unit._id, updated._id);

  const label = { accepted: "accepted the assignment", "en-route": "is on the way", arrived: "has arrived", "in-progress": "is treating the patient", completed: "completed the response" }[status];
  notifyUsers([updated.requester._id], {
    type: "request-status",
    title: `Unit ${label}`,
    body: updated.referenceId,
    request: updated._id,
  }).catch(() => {});
  if (status === "accepted") {
    notifyAdmins({ type: "assignment-response", title: "Unit accepted assignment", body: updated.referenceId, request: updated._id }).catch(() => {});
  }
  await broadcastRequestChange(updated);
  return ok(res, { message: `Emergency status updated to ${status}`, request: requestView(updated, "unit") });
});

// Unit declines an assignment it has not accepted yet -> request goes back to the dispatch queue.
const rejectAssignment = wrap(async (req, res) => {
  const reason = v.optString(req.body?.reason, "Reason", { max: 500 });
  const unit = await getUnitOr404(req.user.id);
  const request = await EmergencyRequest.findOne({ _id: req.params.requestId, assignedUnit: unit._id, status: "assigned" });
  if (!request) throw new HttpError(404, "No pending assignment found for this unit");

  const updated = await EmergencyRequest.findOneAndUpdate(
    { _id: request._id, assignedUnit: unit._id, status: "assigned" },
    {
      $set: { status: "pending", assignedUnit: null, assignedAt: null, assignedBy: null },
      $addToSet: { rejectedUnits: unit._id },
      $push: {
        statusHistory: historyEntry({ status: "pending", by: req.user.id, byRole: "unit", note: `Unit rejected assignment${reason ? `: ${reason}` : ""}` }),
        assignmentHistory: { unit: unit._id, action: "rejected", by: req.user.id, byRole: "unit", note: reason, at: new Date() },
      },
    },
    { new: true }
  );
  if (!updated) throw new HttpError(409, "Assignment changed. Refresh and try again.");

  await releaseUnitIfFree(unit._id, updated._id);
  notifyAdmins({ type: "assignment-response", title: "Unit rejected assignment", body: `${updated.referenceId} needs a new unit${reason ? ` · ${reason}` : ""}`, request: updated._id }).catch(() => {});
  await broadcastRequestChange(updated);
  return ok(res, { message: "Assignment rejected. Dispatch has been notified.", request: requestView(updated, "unit") });
});

// Used by admin routes
const getAvailableUnits = wrap(async (req, res) => {
  const units = await Unit.find({ verificationStatus: "verified", availability: "available" }).populate("user", "name phone");
  return ok(res, { count: units.length, units: units.map((u) => ({ ...unitView(u, { exact: true, includeContact: true, includePlate: true }), user: u.user })) });
});

module.exports = {
  registerUnit,
  getMyUnit,
  updateMyUnit,
  getAvailableUnits,
  updateUnitAvailability,
  updateUnitLocation,
  getMyAssignedEmergencies,
  getMyHistory,
  updateEmergencyStatus,
  rejectAssignment,
  VEHICLE_TYPES,
};
