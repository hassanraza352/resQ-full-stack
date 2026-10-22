const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      select: false,
    },

    phone: {
      type: String,
      default: "+92 XXXXXXXXX",
      trim: true,
    },

    role: {
      type: String,
      enum: ["user", "unit", "hospital", "admin"],
      default: "user",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    // Admins can deactivate an account; deactivated accounts cannot use any API.
    isActive: {
      type: Boolean,
      default: true,
    },

    // Optional emergency contact shown to responders on the user's own requests.
    emergencyContact: {
      name: { type: String, trim: true, maxlength: 100, default: "" },
      phone: { type: String, trim: true, maxlength: 30, default: "" },
    },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
