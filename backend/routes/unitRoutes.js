const express = require("express");
const c = require("../controller/unitController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { locationLimiter } = require("../middleware/security");

const router = express.Router();
router.use(protect, authorize("unit"));

router.post("/register", c.registerUnit);
router.get("/me", c.getMyUnit);
router.patch("/me", c.updateMyUnit);
router.patch("/availability", c.updateUnitAvailability);
router.patch("/location", locationLimiter, c.updateUnitLocation);
router.get("/emergencies/assigned", c.getMyAssignedEmergencies);
router.get("/emergencies/history", c.getMyHistory);
router.patch("/emergencies/:requestId/status", c.updateEmergencyStatus);
router.patch("/emergencies/:requestId/reject", c.rejectAssignment);

module.exports = router;
