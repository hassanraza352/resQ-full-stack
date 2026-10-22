const express = require("express");
const {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  updateProfile,
  changePassword,
} = require("../controller/authController");
const { protect } = require("../middleware/authMiddleware");
const { authLimiter, registerLimiter } = require("../middleware/security");

const router = express.Router();

router.post("/register", registerLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/logout", logoutUser);
router.get("/me", protect, getMe);
router.patch("/profile", protect, updateProfile);
router.patch("/password", protect, authLimiter, changePassword);

module.exports = router;
