// Central, validated configuration. Reads process.env AFTER dotenv has run.
const toInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

const load = () => {
  const env = process.env.NODE_ENV || "development";
  const isProd = env === "production";

  const cfg = {
    env,
    isProd,
    port: toInt(process.env.PORT, 5000),
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    trustProxy: process.env.TRUST_PROXY ? toInt(process.env.TRUST_PROXY, 1) : 0,
    cookieSameSite: (process.env.COOKIE_SAMESITE || "lax").toLowerCase(),
    // Dispatch / geo
    nearbyDefaultRadiusKm: toInt(process.env.NEARBY_DEFAULT_RADIUS_KM, 15),
    nearbyMaxRadiusKm: toInt(process.env.NEARBY_MAX_RADIUS_KM, 50),
    unitLocationMaxAgeMin: toInt(process.env.UNIT_LOCATION_MAX_AGE_MIN, 15),
    // Routing (OSRM-compatible)
    routingBaseUrl:
      process.env.ROUTING_BASE_URL || "https://router.project-osrm.org",
    routingTimeoutMs: toInt(process.env.ROUTING_TIMEOUT_MS, 5000),
    routingCacheTtlSec: toInt(process.env.ROUTING_CACHE_TTL_SEC, 120),
    // Retention of per-unit live location history is NOT kept: only latest point.
  };
  return cfg;
};

const validate = (cfg) => {
  const problems = [];
  if (!cfg.mongoUri) problems.push("MONGO_URI is not set");
  if (!cfg.jwtSecret) problems.push("JWT_SECRET is not set");
  if (cfg.isProd && cfg.jwtSecret && cfg.jwtSecret.length < 10)
    problems.push("JWT_SECRET must be at least 10 characters in production");
  if (!["lax", "strict", "none"].includes(cfg.cookieSameSite))
    problems.push("COOKIE_SAMESITE must be lax, strict or none");
  if (cfg.cookieSameSite === "none" && !cfg.isProd)
    problems.push(
      "COOKIE_SAMESITE=none requires HTTPS (secure cookies); use it only in production"
    );
  return problems;
};

module.exports = { load, validate };
