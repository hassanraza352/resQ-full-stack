const { Queue } = require("bullmq");

const redisUrl = new URL(
  process.env.REDIS_URL || "redis://127.0.0.1:6379"
);

const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  maxRetriesPerRequest: null,
};

if (redisUrl.username) {
  connection.username = decodeURIComponent(redisUrl.username);
}

if (redisUrl.password) {
  connection.password = decodeURIComponent(redisUrl.password);
}

if (redisUrl.protocol === "rediss:") {
  connection.tls = {};
}

const emailQueue = new Queue("resq-email", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

const queueWelcomeEmail = async ({ name, email }) => {
  return emailQueue.add("welcome-email", { name, email });
};

module.exports = { queueWelcomeEmail, emailQueue };