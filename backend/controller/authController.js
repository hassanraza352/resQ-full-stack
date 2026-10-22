const User = require("../model/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { cookieBase, clearAuthCookie } = require("../middleware/authMiddleware");
const { load } = require("../config/env");
const { HttpError, ok, wrap } = require("../utils/response");
const v = require("../utils/validate");

const PUBLIC_ROLES = ["user", "unit", "hospital"]; // admin can never be self-registered
const ALL_ROLES = ["user", "unit", "hospital", "admin"];
// Pre-computed hash so that "unknown email" costs the same as "wrong password" (timing side-channel).
const DUMMY_HASH = bcrypt.hashSync("resq-dummy-password", 12);

const safeUser = (u) => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  isVerified: u.isVerified,
  emergencyContact: u.emergencyContact || { name: "", phone: "" },
});

const generateToken = (user) =>
  jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: load().jwtExpiresIn,
    algorithm: "HS256",
  });

const registerUser = wrap(async (req, res) => {
  const body = req.body || {};
  const name = v.reqString(body.name, "Name", { min: 2, max: 100 });
  const email = v.reqString(body.email, "Email", { max: 254 }).toLowerCase();
  if (!v.EMAIL_RE.test(email)) throw new HttpError(400, "Please provide a valid email address");
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128)
    throw new HttpError(400, "Password must be between 8 and 128 characters long");
  const phone = v.phone(body.phone);
  if (typeof body.role !== "string" || !PUBLIC_ROLES.includes(body.role))
    throw new HttpError(400, "Invalid role. Allowed roles: user, unit, hospital");

  if (await User.exists({ email })) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const hashed = await bcrypt.hash(body.password, 12);
  const user = await User.create({
    name,
    email,
    password: hashed,
    phone,
    role: body.role, // unit/hospital accounts have NO operational power until an admin verifies their profile
    isVerified: false,
  });

  return ok(res, { message: "Account created successfully", user: safeUser(user) }, 201);
});

const loginUser = wrap(async (req, res) => {
  const { email, password, role } = req.body || {};
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password || typeof role !== "string") {
    throw new HttpError(400, "Email, password and role are required");
  }
  if (!ALL_ROLES.includes(role)) throw new HttpError(400, "Invalid role selected");

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");
  const hash = user?.password || DUMMY_HASH;
  const correct = await bcrypt.compare(password.slice(0, 128), hash);
  if (!user || !correct) throw new HttpError(401, "Invalid email or password");
  if (user.isActive === false) throw new HttpError(403, "This account has been deactivated");
  if (role !== user.role) throw new HttpError(403, "Selected role does not match your account");

  res.cookie("resq_token", generateToken(user), {
    ...cookieBase(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return ok(res, { message: "Login successful", user: safeUser(user) });
});

// Stateless JWT: logout clears the cookie. (Server-side revocation would need a token
// denylist or per-user tokenVersion - documented as a known limitation.)
const logoutUser = (req, res) => {
  clearAuthCookie(res);
  return ok(res, { message: "Logout successful" });
};

const getMe = wrap(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(401, "User account no longer exists");
  return ok(res, { user: safeUser(user) });
});

// Update own profile (never role / email / verification)
const updateProfile = wrap(async (req, res) => {
  const b = req.body || {};
  const update = {};
  if (b.name !== undefined) update.name = v.reqString(b.name, "Name", { min: 2, max: 100 });
  if (b.phone !== undefined) update.phone = v.phone(b.phone);
  if (b.emergencyContact !== undefined) {
    const ec = b.emergencyContact || {};
    update.emergencyContact = {
      name: v.optString(ec.name, "Emergency contact name", { max: 100 }),
      phone: ec.phone ? v.phone(ec.phone, "Emergency contact phone") : "",
    };
  }
  if (!Object.keys(update).length) throw new HttpError(400, "Nothing to update");
  const user = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true, runValidators: true });
  return ok(res, { message: "Profile updated", user: safeUser(user) });
});

const changePassword = wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string")
    throw new HttpError(400, "Current and new password are required");
  if (newPassword.length < 8 || newPassword.length > 128)
    throw new HttpError(400, "New password must be between 8 and 128 characters long");
  if (newPassword === currentPassword)
    throw new HttpError(400, "New password must be different from the current one");
  const user = await User.findById(req.user.id).select("+password");
  if (!user || !(await bcrypt.compare(currentPassword, user.password)))
    throw new HttpError(401, "Current password is incorrect");
  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
  return ok(res, { message: "Password changed" });
});

module.exports = { registerUser, loginUser, logoutUser, getMe, updateProfile, changePassword, safeUser };
