const EmergencyRequest = require("../model/EmergencyRequest");
const Unit = require("../model/Unit");
const Hospital = require("../model/Hospital");
const { HttpError, ok, wrap, paginate, pageMeta } = require("../utils/response");
const v = require("../utils/validate");
const { parseLatLng, toGeoPoint, fromCoordinates, haversineKm } = require("../utils/geo");
const { ACTIVE_STATUSES } = require("../utils/stateMachine");
const { historyEntry, releaseUnitIfFree, makeReferenceId } = require("../services/requestService");
const { requestView, unitView, hospitalView } = require("../services/serialize");
const { notifyAdmins, notifyUsers, broadcastRequestChange } = require("../services/notify");
const { parseNearbyQuery, findUnitsNear, attachRoutes } = require("../services/dispatch");
const { getRoute } = require("../services/routing");
const { canAccessRequest } = require("../services/access");
const sockets = require("../socket");

const TYPES = ["medical", "accident", "cardiac", "pregnancy", "fire", "other"];
const HIGH_PRIORITY = ["cardiac", "pregnancy"]; // starting priority; admins can change it

// Accepts {latitude, longitude} (preferred) or legacy coordinates: [longitude, latitude]
const readLocation = (body) => {
  let pos = null;
  if (body.latitude !== undefined || body.longitude !== undefined) {
    pos = parseLatLng(body.latitude, body.longitude);
  } else if (Array.isArray(body.coordinates) && body.coordinates.length === 2) {
    pos = parseLatLng(body.coordinates[1], body.coordinates[0]);
  }
  if (!pos) throw new HttpError(400, "A valid incident location (latitude and longitude) is required");
  return pos;
};

const createEmergencyRequest = wrap(async (req, res) => {
  const b = req.body || {};
  const emergencyType = v.oneOf(b.emergencyType, TYPES, "Emergency type");
  const contactNumber = v.phone(b.contactNumber, "Contact number");
  const address = v.reqString(b.address, "Address", { min: 3, max: 300 });
  const description = v.optString(b.description, "Description", { max: 1000 });
  const pos = readLocation(b);
  const source = ["gps", "manual", "adjusted"].includes(b.locationSource) ? b.locationSource : "manual";
  const accuracy =
    typeof b.accuracy === "number" && Number.isFinite(b.accuracy) && b.accuracy >= 0 ? Math.round(b.accuracy) : null;

  const clientRequestId = String(req.headers["idempotency-key"] || b.clientRequestId || "").slice(0, 100) || undefined;

  // Idempotent retry / double click: return the original request, do not create a second one.
  if (clientRequestId) {
    const existing = await EmergencyRequest.findOne({ requester: req.user.id, clientRequestId });
    if (existing) {
      return ok(res, { message: "Request already received", duplicate: true, request: requestView(existing, "user") }, 200);
    }
  }

  const active = await EmergencyRequest.findOne({ requester: req.user.id, status: { $in: ACTIVE_STATUSES } });
  if (active) {
    throw new HttpError(409, "You already have an active emergency request", { request: requestView(active, "user") });
  }

  let doc = null;
  for (let attempt = 0; attempt < 3 && !doc; attempt++) {
    try {
      doc = await EmergencyRequest.create({
        referenceId: makeReferenceId(),
        clientRequestId,
        requester: req.user.id,
        emergencyType,
        priority: HIGH_PRIORITY.includes(emergencyType) ? "high" : "normal",
        description,
        contactNumber,
        location: { address, coordinates: [pos.longitude, pos.latitude], accuracy, source },
        status: "pending",
        statusHistory: [historyEntry({ status: "pending", by: req.user.id, byRole: "user", note: "Request created" })],
      });
    } catch (e) {
      if (e.code === 11000 && e.keyPattern?.clientRequestId) {
        const existing = await EmergencyRequest.findOne({ requester: req.user.id, clientRequestId });
        if (existing) return ok(res, { message: "Request already received", duplicate: true, request: requestView(existing, "user") });
      }
      if (e.code === 11000 && e.keyPattern?.referenceId) continue; // regenerate id
      throw e;
    }
  }
  if (!doc) throw new HttpError(500, "Could not create request, please try again");

  // Real-time + persisted notification for admins (best effort; the request is already saved)
  sockets.toRole("admin", "emergency:new", { requestId: doc._id.toString(), referenceId: doc.referenceId, at: new Date().toISOString() });
  notifyAdmins({
    type: "request-created",
    title: `New ${emergencyType} emergency`,
    body: `${doc.referenceId} · ${address}`,
    request: doc._id,
  }).catch((e) => console.error("notify admins:", e.message));

  return ok(res, { message: "Emergency request created successfully", request: requestView(doc, "user") }, 201);
});

const getMyEmergencyRequests = wrap(async (req, res) => {
  const p = paginate(req.query, { defaultLimit: 20 });
  const filter = { requester: req.user.id };
  const scope = String(req.query.scope || "all");
  if (scope === "active") filter.status = { $in: ACTIVE_STATUSES };
  else if (scope === "history") filter.status = { $nin: ACTIVE_STATUSES };
  if (req.query.status) filter.status = String(req.query.status);

  const [rows, total] = await Promise.all([
    EmergencyRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .populate("assignedUnit", "vehicleType availability contactNumber"),
    EmergencyRequest.countDocuments(filter),
  ]);
  return ok(res, { count: rows.length, requests: rows.map((r) => requestView(r, "user")), meta: pageMeta(p, total) });
});

const getEmergencyRequestById = wrap(async (req, res) => {
  const r = await EmergencyRequest.findOne({ _id: req.params.requestId, requester: req.user.id })
    .populate("assignedUnit")
    .populate("assignedHospital");
  if (!r) throw new HttpError(404, "Emergency request not found");
  return ok(res, {
    request: requestView(r, "user", { populatedUnitExact: true }),
    policy: { cancellable: ["pending", "assigned"].includes(r.status) },
  });
});

// Requester may cancel while pending, or while assigned but not yet accepted by the unit.
const cancelEmergencyRequest = wrap(async (req, res) => {
  const reason = v.optString(req.body?.reason, "Reason", { max: 500 });
  const current = await EmergencyRequest.findOne({ _id: req.params.requestId, requester: req.user.id });
  if (!current) throw new HttpError(404, "Emergency request not found");
  if (!["pending", "assigned"].includes(current.status)) {
    throw new HttpError(409, "This request can no longer be cancelled. Please contact the assigned unit or dispatcher.", {
      currentStatus: current.status,
    });
  }

  const updated = await EmergencyRequest.findOneAndUpdate(
    { _id: current._id, requester: req.user.id, status: { $in: ["pending", "assigned"] } },
    {
      $set: { status: "cancelled", cancelledAt: new Date(), cancelReason: reason },
      $push: {
        statusHistory: historyEntry({ status: "cancelled", by: req.user.id, byRole: "user", note: reason || "Cancelled by requester" }),
        ...(current.assignedUnit
          ? { assignmentHistory: { unit: current.assignedUnit, action: "released", by: req.user.id, byRole: "system", note: "Requester cancelled", at: new Date() } }
          : {}),
      },
    },
    { new: true }
  );
  if (!updated) throw new HttpError(409, "Request status changed. Refresh and try again.");

  if (current.assignedUnit) await releaseUnitIfFree(current.assignedUnit, updated._id);
  await broadcastRequestChange(updated);
  return ok(res, { message: "Emergency request cancelled successfully", request: requestView(updated, "user") });
});

/**
 * INFORMATIONAL ONLY: lets a user see which verified, available units are around a point.
 * It never reserves or assigns anything - only an admin can dispatch.
 */
const nearbyUnits = wrap(async (req, res) => {
  const q = parseNearbyQuery(req.query);
  const rows = await findUnitsNear({ ...q, limit: q.limit + 1 }); // +1 => hasMore
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  const incident = { latitude: q.latitude, longitude: q.longitude };
  const withRoads = await attachRoutes(page, incident, 5);

  const units = withRoads.map((u) => ({
    ...unitView(u, { exact: false }),
    straightLineKm: Math.round((u.distanceMeters / 1000) * 10) / 10, // discovery distance
    road: u.road, // route-based distance/ETA, or null when routing is unavailable
    assignedToYou: false,
  }));

  return ok(res, {
    units,
    meta: { page: q.page, limit: q.limit, hasMore, radiusKm: q.radiusKm },
    notice:
      "These units are shown for information only. A unit is assigned to you only after RESQ dispatch confirms it.",
    routing: { available: units.some((u) => u.road), kind: "route-estimate (no live traffic)" },
  });
});

const nearbyHospitals = wrap(async (req, res) => {
  const q = parseNearbyQuery(req.query, { defaultLimit: 10 });
  const rows = await Hospital.aggregate([
    {
      $geoNear: {
        near: toGeoPoint(q.latitude, q.longitude),
        key: "location",
        distanceField: "distanceMeters",
        maxDistance: q.radiusKm * 1000,
        spherical: true,
        query: { verificationStatus: "verified" },
      },
    },
    { $skip: q.skip },
    { $limit: q.limit },
  ]);
  return ok(res, {
    hospitals: rows.map((h) => ({
      ...hospitalView(h),
      straightLineKm: Math.round((h.distanceMeters / 1000) * 10) / 10,
    })),
    meta: { page: q.page, limit: q.limit, radiusKm: q.radiusKm },
    notice: "Proximity does not mean a hospital has accepted a patient. Capacity figures are self-reported.",
  });
});

/**
 * Route + ETA for an active request between the assigned unit and the incident.
 * Visible to the requester, the assigned unit and admins only.
 */
const getRequestRoute = wrap(async (req, res) => {
  const r = await EmergencyRequest.findById(req.params.requestId).populate("assignedUnit");
  if (!r || !(await canAccessRequest(req.user, r)) || req.user.role === "hospital") {
    throw new HttpError(404, "Emergency request not found");
  }
  const incident = fromCoordinates(r.location.coordinates);
  const unit = r.assignedUnit;
  const active = ["assigned", "accepted", "en-route", "arrived", "in-progress"].includes(r.status);
  if (!unit || !active) {
    return ok(res, { route: null, reason: "No active assigned unit", incident });
  }
  const view = unitView(unit, { exact: true });
  const pos = unit.location?.coordinates ? fromCoordinates(unit.location.coordinates) : null;
  if (!pos) return ok(res, { route: null, reason: "Unit has not shared a location yet", incident, unit: view });

  const route = await getRoute(pos, incident);
  return ok(res, {
    incident,
    unit: view,
    straightLineKm: Math.round(haversineKm(pos, incident) * 10) / 10,
    route, // null => routing provider unavailable; UI must say so instead of inventing an ETA
    reason: route ? undefined : "Routing service unavailable",
  });
});

module.exports = {
  createEmergencyRequest,
  getMyEmergencyRequests,
  getEmergencyRequestById,
  cancelEmergencyRequest,
  nearbyUnits,
  nearbyHospitals,
  getRequestRoute,
  Unit,
  notifyUsers,
};
