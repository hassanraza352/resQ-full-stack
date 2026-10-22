const { fromCoordinates, roundCoord } = require("../utils/geo");
const { load } = require("../config/env");
const { allowedNext } = require("../utils/stateMachine");

const idStr = (v) => (v && v._id ? v._id.toString() : v ? v.toString() : null);

const STALE_AFTER_MS = 2 * 60 * 1000; // a unit position older than this is shown as stale

const unitLabel = (u) => u.label || `RESQ-${idStr(u).slice(-4).toUpperCase()}`;

/**
 * Unit as seen by someone who is NOT the unit itself.
 *  exact=false  -> coordinates rounded (~110 m) for the public "nearby" view
 *  exact=true   -> precise position (admin, or the requester of an ACTIVE assignment)
 */
const unitView = (u, { exact = false, includeContact = false, includePlate = false } = {}) => {
  if (!u) return null;
  const pos = u.location?.coordinates ? fromCoordinates(u.location.coordinates) : null;
  const age = u.locationUpdatedAt ? Date.now() - new Date(u.locationUpdatedAt).getTime() : null;
  return {
    id: idStr(u),
    label: unitLabel(u),
    vehicleType: u.vehicleType,
    availability: u.availability,
    ...(includePlate ? { registrationNumber: u.registrationNumber, vehicleModel: u.vehicleModel, capacity: u.capacity, verificationStatus: u.verificationStatus } : {}),
    ...(includeContact ? { contactNumber: u.contactNumber } : {}),
    location: pos
      ? {
          latitude: exact ? pos.latitude : roundCoord(pos.latitude),
          longitude: exact ? pos.longitude : roundCoord(pos.longitude),
          accuracy: exact ? u.locationAccuracy ?? null : null,
          updatedAt: u.locationUpdatedAt || null,
          stale: age === null ? true : age > STALE_AFTER_MS,
          precision: exact ? "exact" : "approximate",
        }
      : null,
  };
};

const hospitalView = (h, { includePrivate = false } = {}) => {
  if (!h) return null;
  const pos = h.location?.coordinates ? fromCoordinates(h.location.coordinates) : null;
  const b = h.beds || {};
  return {
    id: idStr(h),
    hospitalName: h.hospitalName,
    address: h.address,
    contactNumber: h.contactNumber,
    emergencyAvailability: h.emergencyAvailability,
    verificationStatus: includePrivate ? h.verificationStatus : undefined,
    registrationNumber: includePrivate ? h.registrationNumber : undefined,
    emergencyCapacity: includePrivate ? h.emergencyCapacity : undefined,
    location: pos,
    beds: {
      totalBeds: b.totalBeds ?? 0,
      availableBeds: b.availableBeds ?? 0,
      icuTotal: b.icuTotal ?? 0,
      icuAvailable: b.icuAvailable ?? 0,
      updatedAt: b.updatedAt || null,
      // capacity numbers are self-reported; flag anything older than 6 h
      stale: !b.updatedAt || Date.now() - new Date(b.updatedAt).getTime() > 6 * 3600 * 1000,
    },
  };
};

/**
 * Emergency request for a given viewer role.
 * Both `id` and `_id` are emitted (legacy clients), and location keeps the legacy
 * `coordinates: [lng, lat]` next to explicit latitude/longitude.
 */
const requestView = (r, viewerRole, { populatedUnitExact = false } = {}) => {
  const pos = fromCoordinates(r.location?.coordinates);
  const requester = r.requester && r.requester.name !== undefined ? r.requester : null;
  const unitActive = ["assigned", "accepted", "en-route", "arrived", "in-progress"].includes(r.status);

  const view = {
    id: idStr(r),
    _id: idStr(r),
    referenceId: r.referenceId,
    emergencyType: r.emergencyType,
    priority: r.priority,
    description: r.description,
    contactNumber: r.contactNumber,
    status: r.status,
    location: {
      address: r.location?.address,
      coordinates: r.location?.coordinates,
      latitude: pos?.latitude,
      longitude: pos?.longitude,
      accuracy: r.location?.accuracy ?? null,
      source: r.location?.source,
    },
    statusHistory: (r.statusHistory || []).map((h) => ({
      status: h.status,
      byRole: h.byRole,
      note: h.note,
      at: h.at,
    })),
    allowedNext: allowedNext(r.status, viewerRole),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    assignedAt: r.assignedAt || null,
    cancelledAt: r.cancelledAt || null,
    completedAt: r.completedAt || null,
    cancelReason: r.cancelReason || "",
    hospitalResponse: r.hospitalResponse || { status: "pending" },
  };

  if (requester && viewerRole !== "user") {
    view.requester = {
      id: idStr(requester),
      name: requester.name,
      phone: requester.phone,
      ...(viewerRole === "admin" ? { email: requester.email } : {}),
    };
  }

  if (r.assignedUnit && r.assignedUnit.registrationNumber !== undefined) {
    // populated unit
    view.assignedUnit = unitView(r.assignedUnit, {
      exact: unitActive && (populatedUnitExact || viewerRole === "admin" || viewerRole === "unit"),
      includeContact: true,
      includePlate: viewerRole === "admin" || viewerRole === "unit",
    });
  } else {
    view.assignedUnit = r.assignedUnit ? { id: idStr(r.assignedUnit) } : null;
  }

  if (r.assignedHospital && r.assignedHospital.hospitalName !== undefined) {
    view.assignedHospital = hospitalView(r.assignedHospital);
  } else {
    view.assignedHospital = r.assignedHospital ? { id: idStr(r.assignedHospital) } : null;
  }

  if (viewerRole === "admin") {
    view.assignmentHistory = (r.assignmentHistory || []).map((a) => ({
      unit: idStr(a.unit),
      action: a.action,
      byRole: a.byRole,
      note: a.note,
      at: a.at,
    }));
    view.rejectedUnits = (r.rejectedUnits || []).map(idStr);
  }

  return view;
};

const statusFlow = ["pending", "assigned", "accepted", "en-route", "arrived", "in-progress", "completed"];

module.exports = { unitView, hospitalView, requestView, idStr, unitLabel, statusFlow, load };
