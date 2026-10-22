const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema(
  {
    // Driver / unit account
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Ambulance identification
    registrationNumber: {
      type: String,
      required: [true, "Registration number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },

    vehicleModel: {
      type: String,
      required: [true, "Vehicle model is required"],
      trim: true,
    },

    vehicleType: {
      type: String,
      enum: ["basic", "advanced", "patient-transport"],
      required: true,
    },

    availability: {
      type: String,
      enum: ["available", "busy", "offline"],
      default: "offline",
    },

    // Verification by admin
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },

    // Latest known position only (GeoJSON Point, [longitude, latitude]).
    // NOTE: no `default` on `type` - a Point without coordinates breaks the 2dsphere index.
    // No location history is retained (privacy).
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
    },
    locationUpdatedAt: { type: Date, default: null },
    locationAccuracy: { type: Number, default: null, min: 0 }, // metres

    contactNumber: {
      type: String,
      required: [true, "Contact number is required"],
      trim: true,
    },

    capacity: {
      type: Number,
      required: [true, "Capacity is required"],
      min: 1,
    },
  },
  { timestamps: true }
);

// Geospatial index for nearby-unit searches
unitSchema.index({ location: "2dsphere" });
unitSchema.index({ verificationStatus: 1, availability: 1 });

// Approved public label: never exposes the licence plate to other roles.
unitSchema.virtual("label").get(function () {
  return `RESQ-${this._id.toString().slice(-4).toUpperCase()}`;
});

module.exports = mongoose.model("Unit", unitSchema);
