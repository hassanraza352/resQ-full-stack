
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { redisClient } = require("../config/redis");

// Shared Redis store for rate-limit counters
const createRedisStore = (prefix) =>
  new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix,
  });

// General API rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: createRedisStore("rl:general:"),
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

// Stricter limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: createRedisStore("rl:auth:"),
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
};
