const express = require("express");
const n = require("../controller/notificationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);

router.get("/", n.listNotifications);
router.get("/unread-count", n.unreadCount);
router.patch("/read-all", n.markAllRead);
router.patch("/:id/read", n.markRead);

module.exports = router;
