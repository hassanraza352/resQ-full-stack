require("dotenv").config();

const { Worker } = require("bullmq");
const { sendWelcomeEmail } = require("../services/emailService");

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

const worker = new Worker(
  "resq-email",
  async (job) => {
    if (job.name === "welcome-email") {
      await sendWelcomeEmail(job.data);

      console.log(`Welcome email sent to ${job.data.email}`);
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`Email job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(
    `Email job ${job?.id} failed:`,
    error.message
  );
});

worker.on("error", (error) => {
  console.error("Email worker error:", error.message);
});

console.log("RESQ email worker is running");

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);