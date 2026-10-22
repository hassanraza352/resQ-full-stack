
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]); // Atlas SRV lookups

require("dotenv").config();

const http = require("http");
const connectDB = require("./config/db");
const { load, validate } = require("./config/env");
const sockets = require("./socket");

const {
  connectRedis,
  disconnectRedis,
} = require("./config/redis");

const cfg = load();
const problems = validate(cfg);

if (problems.length) {
  console.error(
    "Configuration problems:\n - " + problems.join("\n - ")
  );
  process.exit(1);
}

const start = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Connect to Redis before loading rate-limit middleware
    await connectRedis();

    // 3. Load the app only after Redis is ready
    const createApp = require("./app");
    const app = createApp();

    // 4. Create HTTP server
    const server = http.createServer(app);

    // 5. Initialize Socket.IO
    sockets.init(server, cfg);

    // 6. Start listening
    server.listen(cfg.port, () => {
      console.log(
        `Server running on port ${cfg.port} (${cfg.env})`
      );
    });

    // 7. Graceful shutdown
    const shutdown = (sig) => {
      console.log(`${sig} received, shutting down`);

      server.close(async () => {
        try {
          await disconnectRedis();
          console.log("Redis connection closed");
          process.exit(0);
        } catch (error) {
          console.error(
            "Redis shutdown error:",
            error.message
          );
          process.exit(1);
        }
      });

      setTimeout(() => process.exit(1), 8000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Server startup failed:", error.message);

    try {
      await disconnectRedis();
    } catch (shutdownError) {
      console.error(
        "Redis cleanup error:",
        shutdownError.message
      );
    }

    process.exit(1);
  }
};

process.on("unhandledRejection", (error) => {
  console.error(
    "Unhandled rejection:",
    error?.message || error
  );
});

start();
