const express = require("express");
const c = require("../controller/hospitalController");
const { nearbyHospitals } = require("../controller/emergencyController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { searchLimiter } = require("../middleware/security");

const router = express.Router();

// Any signed-in role may look up verified hospitals near a point (public-safe fields only)
router.get("/nearby", protect, authorize("user", "unit", "admin", "hospital"), searchLimiter, nearbyHospitals);

// Everything below: the hospital's own account only
router.use(protect, authorize("hospital"));

router.post("/register", c.registerHospital);
router.get("/me", c.getMyHospital);
router.patch("/me", c.updateMyHospital);
router.patch("/availability", c.updateHospitalAvailability);
router.patch("/beds", c.updateBeds);

router.get("/staff", c.listStaff);
router.post("/staff", c.addStaff);
router.patch("/staff/:staffId", c.updateStaff);
router.delete("/staff/:staffId", c.removeStaff);

router.get("/emergencies/incoming", c.getHospitalEmergencyRequests);
router.get("/cases/history", c.getCaseHistory);
router.get("/cases/:requestId", c.getCase);
router.patch("/cases/:requestId/respond", c.respondToCase);

module.exports = router;
