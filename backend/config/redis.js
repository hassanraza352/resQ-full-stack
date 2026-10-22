
const { createClient } = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
});

redisClient.on("connect", () => {
  console.log("Connecting to Redis...");
});

redisClient.on("ready", () => {
  console.log("Redis connected and ready");
});

redisClient.on("error", (error) => {
  console.error("Redis error:", error.message);
});

redisClient.on("reconnecting", () => {
  console.log("Reconnecting to Redis...");
});

const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  return redisClient;
};

const disconnectRedis = async () => {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
};

module.exports = {
  redisClient,
  connectRedis,
  disconnectRedis,
};
