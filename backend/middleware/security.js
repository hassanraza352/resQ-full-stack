
const rateLimit = require("express-rate-limit");
const { load } = require("../config/env");
const { HttpError } = require("../utils/response");
const { RedisStore } = require("rate-limit-redis");
const { redisClient } = require("../config/redis");

const json429 = (message) => ({ success: false, message });



const limiter = (opts, prefix) =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...opts,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix,
    }),
  });



// Brute-force protection for credentials endpoints
const authLimiter = limiter(
  {
    windowMs: 15 * 60 * 1000,
    limit: 20,
    message: json429("Too many attempts. Please try again in 15 minutes."),
  },
  "rl:auth:"
);

const registerLimiter = limiter(
  {
    windowMs: 60 * 60 * 1000,
    limit: 20,
    message: json429(
      "Too many registrations from this address. Try again later."
    ),
  },
  "rl:register:"
);

// Whole API
const apiLimiter = limiter(
  {
    windowMs: 60 * 1000,
    limit: 300,
    message: json429("Too many requests. Please slow down."),
  },
  "rl:api:"
);

// Emergency creation
const emergencyCreateLimiter = limiter(
  {
    windowMs: 10 * 60 * 1000,
    limit: 10,
    message: json429(
      "Too many emergency submissions. If this is urgent, call your local emergency number."
    ),
  },
  "rl:emergency-create:"
);

// Expensive endpoints (geo + routing)
const searchLimiter = limiter(
  {
    windowMs: 60 * 1000,
    limit: 40,
    message: json429("Too many map searches. Please wait a moment."),
  },
  "rl:search:"
);

// Unit GPS pings: runs after protect middleware
const locationLimiter = limiter(
  {
    windowMs: 10 * 1000,
    limit: 5,
    keyGenerator: (req) => `loc:${req.user?.id || "anon"}`,
    validate: { keyGeneratorIpFallback: false },
    message: json429("Location updates are too frequent."),
  },
  "rl:location:"
);

/**
 * Removes Mongo operator injection from req.body.
 */
const stripOperators = (value) => {
  if (Array.isArray(value)) return value.forEach(stripOperators);

  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (key.startsWith("$") || key.includes(".")) {
        delete value[key];
      } else {
        stripOperators(value[key]);
      }
    }
  }
};

const sanitizeBody = (req, _res, next) => {
  if (req.body) stripOperators(req.body);
  next();
};

/**
 * CSRF defence for cookie auth.
 */
const originGuard = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const cfg = load();
  const origin = req.headers.origin;

  if (origin && !cfg.clientOrigins.includes(origin)) {
    return res.status(403).json({
      success: false,
      message: "Origin not allowed",
    });
  }

  const hasBody = Number(req.headers["content-length"] || 0) > 0;

  if (hasBody && !req.is("application/json")) {
    return res.status(415).json({
      success: false,
      message: "Content-Type must be application/json",
    });
  }

  return next();
};

/** Single place that turns thrown errors into consistent JSON. */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({ success: false, message: err.message, ...(err.extra || {}) });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON body",
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request body too large",
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid identifier",
    });
  }

  if (err.name === "ValidationError") {
    const first = Object.values(err.errors || {})[0];

    return res.status(400).json({
      success: false,
      message: first?.message || "Validation failed",
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Duplicate value conflict",
    });
  }

  console.error(
    `[${req.method} ${req.originalUrl}]`,
    err.message
  );

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

const notFound = (req, res) =>
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });

module.exports = {
  authLimiter,
  registerLimiter,
  apiLimiter,
  emergencyCreateLimiter,
  searchLimiter,
  locationLimiter,
  sanitizeBody,
  originGuard,
  errorHandler,
  notFound,
};
