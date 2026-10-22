/**
 * Socket.IO layer.
 *  - Auth: same HTTP-only JWT cookie as REST (handshake cookie header). Role loaded from DB.
 *  - Rooms: user:<id> (private), role:<role>, request:<id> (joined ONLY after a DB access check).
 *  - The database is the source of truth: events only tell clients "something changed";
 *    clients re-fetch over REST (also done on every reconnect).
 */
const { Server } = require("socket.io");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../model/User");
const EmergencyRequest = require("../model/EmergencyRequest");
const { canAccessRequest } = require("../services/access");

let io = null;

const init = (httpServer, cfg) => {
  io = new Server(httpServer, {
    cors: { origin: cfg.clientOrigins, credentials: true },
    maxHttpBufferSize: 1e4, // clients only send tiny join/leave payloads
  });

  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie || "";
      const token = cookie.parse(raw).resq_token;
      if (!token) return next(new Error("unauthorized"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      const user = await User.findById(decoded.id).select("role isActive");
      if (!user || user.isActive === false) return next(new Error("unauthorized"));
      socket.data.user = { id: user._id.toString(), role: user.role };
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { id, role } = socket.data.user;
    socket.join(`user:${id}`);
    socket.join(`role:${role}`);

    socket.on("request:join", async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const requestId = payload?.requestId;
        if (typeof requestId !== "string" || !mongoose.isValidObjectId(requestId)) {
          return reply({ ok: false, message: "Invalid request id" });
        }
        const request = await EmergencyRequest.findById(requestId).select(
          "requester assignedUnit assignedHospital"
        );
        if (!request || !(await canAccessRequest(socket.data.user, request))) {
          return reply({ ok: false, message: "Not allowed" }); // same answer for missing/forbidden
        }
        await socket.join(`request:${requestId}`);
        return reply({ ok: true });
      } catch {
        return reply({ ok: false, message: "Failed" });
      }
    });

    socket.on("request:leave", (payload) => {
      if (typeof payload?.requestId === "string") socket.leave(`request:${payload.requestId}`);
    });
  });

  return io;
};

const safeEmit = (room, event, payload) => {
  if (io) io.to(room).emit(event, payload);
};

const toUser = (userId, event, payload) => userId && safeEmit(`user:${userId}`, event, payload);
const toRole = (role, event, payload) => safeEmit(`role:${role}`, event, payload);
const toRequest = (requestId, event, payload) => safeEmit(`request:${requestId}`, event, payload);

module.exports = { init, toUser, toRole, toRequest, getIo: () => io };
