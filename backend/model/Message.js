const mongoose = require("mongoose");

// Messages live inside the context of one emergency request; only that request's
// participants (requester, assigned unit, assigned hospital, admins) can read/write.
const messageSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmergencyRequest",
      required: true,
      index: true,
    },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["user", "unit", "hospital", "admin"], required: true },
    senderName: { type: String, trim: true, maxlength: 100, default: "" },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

messageSchema.index({ request: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
