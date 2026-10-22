const mongoose = require("mongoose");
const { STATUSES } = require("../utils/stateMachine");

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    byRole: { type: String, enum: ["user", "unit", "hospital", "admin", "system"], required: true },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const assignmentEventSchema = new mongoose.Schema(
  {
    unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    action: {
      type: String,
      enum: ["assigned", "reassigned", "rejected", "released"],
      required: true,
    },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    byRole: { type: String, enum: ["unit", "admin", "system"], required: true },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const emergencyRequestSchema = new mongoose.Schema(
  {
    // Human-friendly unique reference shown to the user, e.g. RSQ-261016-7K2QD9
    referenceId: { type: String, unique: true, index: true },

    // Client-generated key that makes retries / double-clicks idempotent per user.
    clientRequestId: { type: String, trim: true, maxlength: 100, default: undefined },

    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    emergencyType: {
      type: String,
      enum: ["medical", "accident", "cardiac", "pregnancy", "fire", "other"],
      required: true,
    },

    priority: {
      type: String,
      enum: ["low", "normal", "high", "critical"],
      default: "normal",
      index: true,
    },

    description: { type: String, trim: true, maxlength: 1000, default: "" },

    contactNumber: { type: String, required: true, trim: true },

    location: {
      address: { type: String, required: true, trim: true },
      // [longitude, latitude]
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (value) =>
            Array.isArray(value) &&
            value.length === 2 &&
            value.every(Number.isFinite) &&
            value[0] >= -180 &&
            value[0] <= 180 &&
            value[1] >= -90 &&
            value[1] <= 90,
          message: "Coordinates must be [longitude, latitude] within valid ranges",
        },
      },
      accuracy: { type: Number, min: 0, default: null }, // metres, from browser GPS
      source: { type: String, enum: ["gps", "manual", "adjusted"], default: "gps" },
    },

    status: {
      type: String,
      enum: STATUSES,
      default: "pending",
      index: true,
    },
    statusHistory: { type: [historySchema], default: [] },

    assignedUnit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", default: null },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignmentHistory: { type: [assignmentEventSchema], default: [] },
    rejectedUnits: [{ type: mongoose.Schema.Types.ObjectId, ref: "Unit" }],

    assignedHospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      default: null,
      index: true,
    },
    hospitalResponse: {
      status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
      respondedAt: { type: Date, default: null },
      note: { type: String, trim: true, maxlength: 500, default: "" },
    },

    cancelReason: { type: String, trim: true, maxlength: 500, default: "" },
    cancelledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

emergencyRequestSchema.index({ "location.coordinates": "2dsphere" });
emergencyRequestSchema.index({ assignedUnit: 1, status: 1 });
emergencyRequestSchema.index({ status: 1, createdAt: -1 });
// Idempotency: one clientRequestId per requester (only when provided).
emergencyRequestSchema.index(
  { requester: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } }
);
module.exports = mongoose.model("EmergencyRequest", emergencyRequestSchema);
