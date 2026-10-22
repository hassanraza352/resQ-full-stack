const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const c = require("../controller/adminController");
const { getAvailableUnits } = require("../controller/unitController");
const { searchLimiter } = require("../middleware/security");

const router = express.Router();

// Every route below requires an authenticated, active ADMIN (enforced server-side)
router.use(protect, authorize("admin"));

router.get("/dashboard", c.getDashboard); // welcome + live stats (original path kept)
router.get("/metrics", c.getDashboardStats);
router.get("/reports", c.getReports);

// users
router.get("/users", c.listUsers);
router.patch("/users/:userId/active", c.setUserActive);
router.patch("/users/:userId/assign-unit", c.assignUnitRole);
router.patch("/users/:userId/assign-hospital", c.assignHospitalRole);

// units
router.get("/units", c.listUnits);
router.get("/units/pending", c.getPendingUnits);
router.get("/units/available", getAvailableUnits);
router.patch("/units/:unitId/review", c.reviewUnit);

// hospitals
router.get("/hospitals", c.listHospitals);
router.get("/hospitals/pending", c.getPendingHospitals);
router.get("/hospitals/available", c.getAvailableHospitals);
router.patch("/hospitals/:hospitalId/review", c.reviewHospital);

// incidents / dispatch
router.get("/emergencies", c.listEmergencies);
router.get("/emergencies/pending", c.getPendingEmergencies);
router.get("/emergencies/:requestId", c.getEmergency);
router.get("/emergencies/:requestId/candidates", searchLimiter, c.getCandidates);
router.patch("/emergencies/:requestId/assign", c.assignUnitToEmergency);
router.patch("/emergencies/:requestId/reassign", c.reassignUnit);
router.patch("/emergencies/:requestId/assign-hospital", c.assignHospitalToEmergency);
router.patch("/emergencies/:requestId/priority", c.setPriority);
router.patch("/emergencies/:requestId/cancel", c.cancelEmergency);
router.patch("/emergencies/:requestId/reject", c.rejectEmergency);

module.exports = router;
