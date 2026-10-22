const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]); // kept from the original project (Atlas SRV lookups)

require("dotenv").config();

const http = require("http");
const connectDB = require("./config/db");
const { load, validate } = require("./config/env");
const createApp = require("./app");
const sockets = require("./socket");

const cfg = load();
const problems = validate(cfg);
if (problems.length) {
  console.error("Configuration problems:\n - " + problems.join("\n - "));
  process.exit(1);
}
const start = async () => {
  await connectDB();
  const app = createApp();
  const server = http.createServer(app);
  sockets.init(server, cfg);

  server.listen(cfg.port, () => console.log(`Server running on port ${cfg.port} (${cfg.env})`));

  const shutdown = (sig) => {
    console.log(`${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

process.on("unhandledRejection", (e) => console.error("Unhandled rejection:", e?.message || e));
start();
