const Notification = require("../model/Notification");
const User = require("../model/User");
const Unit = require("../model/Unit");
const Hospital = require("../model/Hospital");
const sockets = require("../socket");

/** Persist a notification for each user and push it live (best effort). */
const notifyUsers = async (userIds, { type = "system", title, body = "", request = null }) => {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (!ids.length) return [];
  const docs = await Notification.insertMany(
    ids.map((user) => ({ user, type, title, body, request }))
  );
  docs.forEach((d) =>
    sockets.toUser(d.user.toString(), "notification:new", {
      id: d._id.toString(),
      type: d.type,
      title: d.title,
      body: d.body,
      request: d.request ? d.request.toString() : null,
      createdAt: d.createdAt,
    })
  );
  return docs;
};

const notifyAdmins = async (payload) => {
  const admins = await User.find({ role: "admin", isActive: { $ne: false } }).select("_id");
  return notifyUsers(
    admins.map((a) => a._id),
    payload
  );
};

/**
 * Lightweight "something changed" signal to every authorized party of a request.
 * Payload deliberately carries no location or personal data.
 */
const broadcastRequestChange = async (request, event = "emergency:updated") => {
  try {
    const payload = {
      requestId: request._id.toString(),
      referenceId: request.referenceId,
      status: request.status,
      at: new Date().toISOString(),
    };
    sockets.toUser(request.requester?._id?.toString() || request.requester?.toString(), event, payload);
    sockets.toRole("admin", event, payload);
    sockets.toRequest(payload.requestId, event, payload);

    const unitId = request.assignedUnit?._id || request.assignedUnit;
    if (unitId) {
      const unit = await Unit.findById(unitId).select("user");
      if (unit) sockets.toUser(unit.user.toString(), event, payload);
    }
    const hospId = request.assignedHospital?._id || request.assignedHospital;
    if (hospId) {
      const h = await Hospital.findById(hospId).select("user");
      if (h) sockets.toUser(h.user.toString(), event, payload);
    }
  } catch (e) {
    console.error("broadcast failed:", e.message);
  }
};

/** User ids of every participant of a request (for notifications/messages). */
const participantUserIds = async (request) => {
  const ids = [request.requester?._id || request.requester];
  const unitId = request.assignedUnit?._id || request.assignedUnit;
  if (unitId) {
    const u = await Unit.findById(unitId).select("user");
    if (u) ids.push(u.user);
  }
  const hospId = request.assignedHospital?._id || request.assignedHospital;
  if (hospId) {
    const h = await Hospital.findById(hospId).select("user");
    if (h) ids.push(h.user);
  }
  return ids.filter(Boolean).map(String);
};

module.exports = { notifyUsers, notifyAdmins, broadcastRequestChange, participantUserIds };
