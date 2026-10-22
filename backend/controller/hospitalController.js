const Hospital = require("../model/Hospital");
const EmergencyRequest = require("../model/EmergencyRequest");
const { HttpError, ok, wrap, paginate, pageMeta } = require("../utils/response");
const v = require("../utils/validate");
const { parseLatLng, toGeoPoint } = require("../utils/geo");
const { requestView, hospitalView } = require("../services/serialize");
const { notifyAdmins, notifyUsers, broadcastRequestChange } = require("../services/notify");

const STAFF_ROLES = ["doctor", "nurse", "paramedic", "receptionist", "admin-staff", "other"];
const SHIFTS = ["morning", "evening", "night"];

const getHospitalOr404 = async (userId) => {
  const h = await Hospital.findOne({ user: userId });
  if (!h) throw new HttpError(404, "Hospital profile not found. Please register first.");
  return h;
};
const requireVerified = (h) => {
  if (h.verificationStatus !== "verified") throw new HttpError(403, "Hospital must be verified by admin first");
};

const registerHospital = wrap(async (req, res) => {
  const b = req.body || {};
  const hospitalName = v.reqString(b.hospitalName, "Hospital name", { min: 2, max: 150 });
  const registrationNumber = v.reqString(b.registrationNumber, "Registration number", { min: 3, max: 40 }).toUpperCase();
  const address = v.reqString(b.address, "Address", { min: 3, max: 300 });
  const contactNumber = v.phone(b.contactNumber, "Contact number");
  const emergencyCapacity = v.int(b.emergencyCapacity, "Emergency capacity", { min: 0, max: 5000 });

  let location;
  if (b.latitude !== undefined || b.longitude !== undefined) {
    const pos = parseLatLng(b.latitude, b.longitude);
    if (!pos) throw new HttpError(400, "Invalid hospital coordinates");
    location = toGeoPoint(pos.latitude, pos.longitude);
  }

  if (await Hospital.exists({ $or: [{ user: req.user.id }, { registrationNumber }] })) {
    throw new HttpError(409, "A hospital profile already exists for this user or registration number");
  }

  const hospital = await Hospital.create({
    user: req.user.id,
    hospitalName,
    registrationNumber,
    address,
    contactNumber,
    emergencyCapacity,
    ...(location ? { location } : {}),
    verificationStatus: "pending",
    emergencyAvailability: "not-accepting",
  });
  notifyAdmins({ type: "verification", title: "New hospital awaiting verification", body: hospitalName }).catch(() => {});
  return ok(res, { message: "Hospital registered. Waiting for admin approval.", hospital: hospitalView(hospital, { includePrivate: true }) }, 201);
});

const getMyHospital = wrap(async (req, res) => {
  const h = await getHospitalOr404(req.user.id);
  return ok(res, { hospital: { ...hospitalView(h, { includePrivate: true }), staffCount: h.staff.length } });
});

const updateMyHospital = wrap(async (req, res) => {
  const h = await getHospitalOr404(req.user.id);
  const b = req.body || {};
  if (b.address !== undefined) h.address = v.reqString(b.address, "Address", { min: 3, max: 300 });
  if (b.contactNumber !== undefined) h.contactNumber = v.phone(b.contactNumber, "Contact number");
  if (b.latitude !== undefined || b.longitude !== undefined) {
    const pos = parseLatLng(b.latitude, b.longitude);
    if (!pos) throw new HttpError(400, "Invalid hospital coordinates");
    h.location = toGeoPoint(pos.latitude, pos.longitude);
  }
  await h.save();
  return ok(res, { message: "Hospital profile updated", hospital: hospitalView(h, { includePrivate: true }) });
});

const updateHospitalAvailability = wrap(async (req, res) => {
  const emergencyAvailability = v.oneOf(req.body?.emergencyAvailability, ["accepting", "not-accepting"], "Availability");
  const h = await getHospitalOr404(req.user.id);
  requireVerified(h);
  h.emergencyAvailability = emergencyAvailability;
  await h.save();
  return ok(res, { message: "Hospital availability updated", data: { emergencyAvailability: h.emergencyAvailability } });
});

const updateBeds = wrap(async (req, res) => {
  const h = await getHospitalOr404(req.user.id);
  requireVerified(h);
  const b = req.body || {};
  const totalBeds = v.int(b.totalBeds, "Total beds", { max: 10000 });
  const availableBeds = v.int(b.availableBeds, "Available beds", { max: 10000 });
  const icuTotal = v.int(b.icuTotal ?? 0, "ICU total", { max: 2000 });
  const icuAvailable = v.int(b.icuAvailable ?? 0, "ICU available", { max: 2000 });
  if (availableBeds > totalBeds) throw new HttpError(400, "Available beds cannot exceed total beds");
  if (icuAvailable > icuTotal) throw new HttpError(400, "Available ICU beds cannot exceed ICU total");
  h.beds = { totalBeds, availableBeds, icuTotal, icuAvailable, updatedAt: new Date() };
  await h.save();
  return ok(res, { message: "Bed capacity updated", hospital: hospitalView(h, { includePrivate: true }) });
});

// ---------- staff directory ----------
const listStaff = wrap(async (req, res) => {
  const h = await getHospitalOr404(req.user.id);
  return ok(res, { count: h.staff.length, staff: h.staff });
});

const readStaff = (b, partial = false) => {
  const out = {};
  if (!partial || b.name !== undefined) out.name = v.reqString(b.name, "Name", { min: 2, max: 100 });
  if (!partial || b.staffRole !== undefined) out.staffRole = v.oneOf(b.staffRole, STAFF_ROLES, "Role");
  if (b.department !== undefined) out.department = v.optString(b.department, "Department", { max: 80 });
  if (b.phone !== undefined && b.phone !== "") out.phone = v.phone(b.phone);
  if (b.shift !== undefined) out.shift = v.oneOf(b.shift, SHIFTS, "Shift");
  if (b.onDuty !== undefined) out.onDuty = !!b.onDuty;
  return out;
};

const addStaff = wrap(async (req, res) => {
  const h = await getHospitalOr404(req.user.id);
  if (h.staff.length >= 500) throw new HttpError(400, "Staff limit reached");
  h.staff.push(readStaff(req.body || {}));
  await h.save();
  return ok(res, { message: "Staff member added", staff: h.staff[h.staff.length - 1] }, 201);
});

const updateStaff = wrap(async (req, res) => {
  const h = await getHospitalOr404(req.user.id);
  const s = h.staff.id(req.params.staffId);
  if (!s) throw new HttpError(404, "Staff member not found");
  Object.assign(s, readStaff(req.body || {}, true));
  await h.save();
  return ok(res, { message: "Staff member updated", staff: s });
});

const removeStaff = wrap(async (req, res) => {
  const h = await getHospitalOr404(req.user.id);
  const s = h.staff.id(req.params.staffId);
  if (!s) throw new HttpError(404, "Staff member not found");
  s.deleteOne();
  await h.save();
  return ok(res, { message: "Staff member removed" });
});

// ---------- cases ----------
const ACTIVE_CASE = ["pending", "assigned", "accepted", "en-route", "arrived", "in-progress"];

// Hospitals see limited patient data: no email, no exact requester profile.
const caseView = (r) => {
  const base = requestView(r, "hospital");
  return {
    ...base,
    assignedUnit: base.assignedUnit && base.assignedUnit.label
      ? { id: base.assignedUnit.id, label: base.assignedUnit.label, vehicleType: base.assignedUnit.vehicleType, location: base.assignedUnit.location }
      : base.assignedUnit,
    assignedHospital: undefined,
  };
};

const getHospitalEmergencyRequests = wrap(async (req, res) => {
  const h = await getHospitalOr404(req.user.id);
  requireVerified(h);
  const rows = await EmergencyRequest.find({ assignedHospital: h._id, status: { $in: ACTIVE_CASE } })
    .populate("requester", "name phone")
    .populate("assignedUnit")
    .sort({ createdAt: -1 });
  return ok(res, { count: rows.length, data: rows.map(caseView), requests: rows.map(caseView) });
});

const getCaseHistory = wrap(async (req, res) => {
  const h = await getHospitalOr404(req.user.id);
  requireVerified(h);
  const p = paginate(req.query, { defaultLimit: 20 });
  const filter = { assignedHospital: h._id, status: { $nin: ACTIVE_CASE } };
  const [rows, total] = await Promise.all([
    EmergencyRequest.find(filter).populate("requester", "name phone").populate("assignedUnit").sort({ updatedAt: -1 }).skip(p.skip).limit(p.limit),
    EmergencyRequest.countDocuments(filter),
  ]);
  return ok(res, { count: rows.length, requests: rows.map(caseView), meta: pageMeta(p, total) });
});

const getCase = wrap(async (req, res) => {
  const h = await getHospitalOr404(req.user.id);
  requireVerified(h);
  const r = await EmergencyRequest.findOne({ _id: req.params.requestId, assignedHospital: h._id })
    .populate("requester", "name phone")
    .populate("assignedUnit");
  if (!r) throw new HttpError(404, "Case not found");
  return ok(res, { request: caseView(r) });
});

// Hospital explicitly accepts or declines a case; proximity alone never implies acceptance.
const respondToCase = wrap(async (req, res) => {
  const response = v.oneOf(req.body?.response, ["accepted", "declined"], "Response");
  const note = v.optString(req.body?.note, "Note", { max: 500 });
  const h = await getHospitalOr404(req.user.id);
  requireVerified(h);

  const updated = await EmergencyRequest.findOneAndUpdate(
    { _id: req.params.requestId, assignedHospital: h._id, status: { $in: ACTIVE_CASE } },
    { $set: { "hospitalResponse.status": response, "hospitalResponse.respondedAt": new Date(), "hospitalResponse.note": note } },
    { new: true }
  )
    .populate("requester", "name phone")
    .populate("assignedUnit");
  if (!updated) throw new HttpError(404, "Active case not found for this hospital");

  notifyAdmins({
    type: "hospital-response",
    title: `Hospital ${response} the case`,
    body: `${updated.referenceId} · ${h.hospitalName}${note ? ` · ${note}` : ""}`,
    request: updated._id,
  }).catch(() => {});
  if (response === "accepted") {
    notifyUsers([updated.requester._id], { type: "hospital-response", title: "A hospital will receive you", body: h.hospitalName, request: updated._id }).catch(() => {});
  }
  await broadcastRequestChange(updated);
  return ok(res, { message: `Case ${response}`, request: caseView(updated) });
});

module.exports = {
  registerHospital,
  getMyHospital,
  updateMyHospital,
  updateHospitalAvailability,
  updateBeds,
  listStaff,
  addStaff,
  updateStaff,
  removeStaff,
  getHospitalEmergencyRequests,
  getCaseHistory,
  getCase,
  respondToCase,
};
