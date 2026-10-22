const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    staffRole: {
      type: String,
      enum: ["doctor", "nurse", "paramedic", "receptionist", "admin-staff", "other"],
      required: true,
    },
    department: { type: String, trim: true, maxlength: 80, default: "" },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    shift: { type: String, enum: ["morning", "evening", "night"], default: "morning" },
    onDuty: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const hospitalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    hospitalName: {
      type: String,
      required: [true, "Hospital name is required"],
      trim: true,
    },

    registrationNumber: {
      type: String,
      required: [true, "Hospital registration number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },

    address: {
      type: String,
      required: [true, "Hospital address is required"],
      trim: true,
    },

    contactNumber: {
      type: String,
      required: [true, "Contact number is required"],
      trim: true,
    },

    emergencyCapacity: {
      type: Number,
      required: [true, "Emergency capacity is required"],
      min: 0,
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },

    emergencyAvailability: {
      type: String,
      enum: ["accepting", "not-accepting"],
      default: "not-accepting",
    },

    // GeoJSON Point [longitude, latitude]; absent until the hospital sets it.
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined },
    },

    // Self-reported capacity. `updatedAt` lets the UI flag stale numbers.
    beds: {
      totalBeds: { type: Number, min: 0, default: 0 },
      availableBeds: { type: Number, min: 0, default: 0 },
      icuTotal: { type: Number, min: 0, default: 0 },
      icuAvailable: { type: Number, min: 0, default: 0 },
      updatedAt: { type: Date, default: null },
    },

    // Staff records are directory entries managed by the hospital account
    // (they are not separate login accounts).
    staff: { type: [staffSchema], default: [] },
  },
  { timestamps: true }
);

hospitalSchema.index({ location: "2dsphere" });
hospitalSchema.index({ verificationStatus: 1, emergencyAvailability: 1 });

module.exports = mongoose.model("Hospital", hospitalSchema);
