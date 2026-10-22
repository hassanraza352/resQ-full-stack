const express = require("express");
const n = require("../controller/notificationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();
router.get("/threads", protect, n.listThreads);

module.exports = router;
