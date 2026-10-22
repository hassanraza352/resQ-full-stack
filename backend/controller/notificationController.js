const Notification = require("../model/Notification");
const EmergencyRequest = require("../model/EmergencyRequest");
const Message = require("../model/Message");
const Unit = require("../model/Unit");
const Hospital = require("../model/Hospital");
const { HttpError, ok, wrap, paginate, pageMeta } = require("../utils/response");
const v = require("../utils/validate");
const { canAccessRequest } = require("../services/access");
const { notifyUsers, participantUserIds } = require("../services/notify");
const { ACTIVE_STATUSES } = require("../utils/stateMachine");
const sockets = require("../socket");

const view = (n) => ({
  id: n._id.toString(),
  type: n.type,
  title: n.title,
  body: n.body,
  request: n.request ? n.request.toString() : null,
  read: !!n.readAt,
  createdAt: n.createdAt,
});

const listNotifications = wrap(async (req, res) => {
  const p = paginate(req.query, { defaultLimit: 30 });
  const filter = { user: req.user.id };
  if (req.query.unread === "true") filter.readAt = null;
  const [rows, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user.id, readAt: null }),
  ]);
  return ok(res, { notifications: rows.map(view), unreadCount: unread, meta: pageMeta(p, total) });
});

const unreadCount = wrap(async (req, res) =>
  ok(res, { unreadCount: await Notification.countDocuments({ user: req.user.id, readAt: null }) })
);

const markRead = wrap(async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: v.objectId(req.params.id, "Notification ID"), user: req.user.id },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!n) throw new HttpError(404, "Notification not found");
  return ok(res, { notification: view(n) });
});

const markAllRead = wrap(async (req, res) => {
  const r = await Notification.updateMany({ user: req.user.id, readAt: null }, { $set: { readAt: new Date() } });
  return ok(res, { updated: r.modifiedCount });
});

/* ---------------------------------------------------------------- request-scoped messages */
const loadAccessible = async (req) => {
  const r = await EmergencyRequest.findById(v.objectId(req.params.requestId, "Request ID"));
  if (!r || !(await canAccessRequest(req.user, r))) throw new HttpError(404, "Emergency request not found");
  return r;
};

const msgView = (m, meId) => ({
  id: m._id.toString(),
  text: m.text,
  senderRole: m.senderRole,
  senderName: m.senderName,
  mine: m.sender.toString() === meId,
  createdAt: m.createdAt,
});

const listMessages = wrap(async (req, res) => {
  const r = await loadAccessible(req);
  const rows = await Message.find({ request: r._id }).sort({ createdAt: 1 }).limit(300);
  return ok(res, { messages: rows.map((m) => msgView(m, req.user.id)), requestStatus: r.status, canSend: ACTIVE_STATUSES.includes(r.status) });
});

const sendMessage = wrap(async (req, res) => {
  const r = await loadAccessible(req);
  if (!ACTIVE_STATUSES.includes(r.status)) throw new HttpError(409, "This request is closed; messaging is disabled");
  const text = v.reqString(req.body?.text, "Message", { min: 1, max: 1000 });
  const m = await Message.create({ request: r._id, sender: req.user.id, senderRole: req.user.role, senderName: req.user.name, text });

  const payload = { requestId: r._id.toString(), id: m._id.toString(), at: m.createdAt };
  sockets.toRequest(r._id.toString(), "message:new", payload);
  const others = (await participantUserIds(r)).filter((id) => id !== req.user.id);
  notifyUsers(others, { type: "message", title: `New message from ${req.user.role}`, body: `${r.referenceId}: ${text.slice(0, 80)}`, request: r._id }).catch(() => {});
  return ok(res, { message: msgView(m, req.user.id) }, 201);
});

// Conversation list = requests the caller may access (+ last message), most recent first
const listThreads = wrap(async (req, res) => {
  let filter;
  if (req.user.role === "user") filter = { requester: req.user.id };
  else if (req.user.role === "unit") {
    const unit = await Unit.findOne({ user: req.user.id }).select("_id");
    filter = { assignedUnit: unit?._id || null };
  } else if (req.user.role === "hospital") {
    const h = await Hospital.findOne({ user: req.user.id }).select("_id");
    filter = { assignedHospital: h?._id || null };
  } else filter = { status: { $in: ACTIVE_STATUSES } };

  const reqs = await EmergencyRequest.find(filter).sort({ updatedAt: -1 }).limit(30).select("referenceId status emergencyType updatedAt");
  const last = await Message.aggregate([
    { $match: { request: { $in: reqs.map((r) => r._id) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$request", text: { $first: "$text" }, at: { $first: "$createdAt" }, role: { $first: "$senderRole" } } },
  ]);
  const map = new Map(last.map((l) => [l._id.toString(), l]));
  return ok(res, {
    threads: reqs.map((r) => ({
      requestId: r._id.toString(),
      referenceId: r.referenceId,
      status: r.status,
      emergencyType: r.emergencyType,
      active: ACTIVE_STATUSES.includes(r.status),
      lastMessage: map.get(r._id.toString()) ? { text: map.get(r._id.toString()).text, at: map.get(r._id.toString()).at, role: map.get(r._id.toString()).role } : null,
    })),
  });
});

module.exports = { listNotifications, unreadCount, markRead, markAllRead, listMessages, sendMessage, listThreads };
