const express = require("express");
const c = require("../controller/emergencyController");
const n = require("../controller/notificationController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { emergencyCreateLimiter, searchLimiter } = require("../middleware/security");

const router = express.Router();

// ---- user-only
router.post("/", protect, authorize("user"), emergencyCreateLimiter, c.createEmergencyRequest);
router.get("/my", protect, authorize("user"), c.getMyEmergencyRequests);
// informational discovery (MUST be declared before "/:requestId")
router.get("/nearby-units", protect, authorize("user"), searchLimiter, c.nearbyUnits);

router.get("/:requestId", protect, authorize("user"), c.getEmergencyRequestById);
router.patch("/:requestId/cancel", protect, authorize("user"), c.cancelEmergencyRequest);

// ---- shared, object-level checked inside the controllers (requester / assigned unit / hospital / admin)
router.get("/:requestId/route", protect, authorize("user", "unit", "admin"), searchLimiter, c.getRequestRoute);
router.get("/:requestId/messages", protect, authorize("user", "unit", "hospital", "admin"), n.listMessages);
router.post("/:requestId/messages", protect, authorize("user", "unit", "hospital", "admin"), n.sendMessage);

module.exports = router;
