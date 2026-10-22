const jwt = require("jsonwebtoken");
const User = require("../model/User");
const { load } = require("../config/env");

const cookieBase = () => {
  const cfg = load();
  return {
    httpOnly: true,
    secure: cfg.isProd || cfg.cookieSameSite === "none",
    sameSite: cfg.cookieSameSite,
    path: "/",
  };
};

const clearAuthCookie = (res) => res.clearCookie("resq_token", cookieBase());

const deny = (res, status, message, clear = false) => {
  if (clear) clearAuthCookie(res);
  return res.status(status).json({ success: false, message });
};

/**
 * Authenticates the request from the HTTP-only cookie. The role ALWAYS comes
 * from the database record, never from the token payload or the client.
 */
const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.resq_token;
    if (!token || typeof token !== "string") {
      return deny(res, 401, "Authentication required. Please log in.");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
      const expired = err.name === "TokenExpiredError";
      return deny(
        res,
        401,
        expired ? "Session expired. Please log in again." : "Invalid authentication token",
        true
      );
    }

    const user = await User.findById(decoded.id).select("name email role isActive");
    if (!user) return deny(res, 401, "User account no longer exists", true);
    if (user.isActive === false) return deny(res, 403, "This account has been deactivated");

    req.user = {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
    };
    return next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    return deny(res, 500, "Authentication failed");
  }
};

const authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) return deny(res, 401, "Authentication required");
    if (!allowedRoles.includes(req.user.role)) {
      return deny(res, 403, "You do not have permission to access this resource");
    }
    return next();
  };

module.exports = { protect, authorize, cookieBase, clearAuthCookie };
