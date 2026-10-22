const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "request-created",
        "request-status",
        "assignment",
        "assignment-response",
        "hospital-case",
        "hospital-response",
        "verification",
        "message",
        "system",
      ],
      default: "system",
    },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, trim: true, maxlength: 500, default: "" },
    request: { type: mongoose.Schema.Types.ObjectId, ref: "EmergencyRequest", default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
// Auto-purge after 90 days (retention policy).
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model("Notification", notificationSchema);
