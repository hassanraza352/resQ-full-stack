const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const { load } = require("./config/env");
const { apiLimiter, sanitizeBody, originGuard, errorHandler, notFound } = require("./middleware/security");

const createApp = () => {
  const cfg = load();
  const app = express();

  app.disable("x-powered-by");
  if (cfg.trustProxy) app.set("trust proxy", cfg.trustProxy); // needed behind nginx/Render/Heroku for correct rate-limit IPs

  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin: (origin, cb) => {
        // no Origin header => same-origin / curl / Postman; otherwise must be allow-listed
        if (!origin || cfg.clientOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
    })
  );
  app.use(express.json({ limit: "50kb" }));
  app.use(cookieParser());
  app.use(sanitizeBody);
  app.use(originGuard);

  app.get("/", (req, res) => res.json({ success: true, message: "RESQ Backend API is running" }));
  app.get("/api/health", (req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ success: up, status: up ? "ok" : "database-unavailable", uptime: Math.round(process.uptime()) });
  });

  app.use("/api", apiLimiter);
  app.use("/api/auth", require("./routes/authRoutes"));
  app.use("/api/admin", require("./routes/adminRoutes"));
  app.use("/api/units", require("./routes/unitRoutes"));
  app.use("/api/hospitals", require("./routes/hospitalRoutes"));
  app.use("/api/emergencies", require("./routes/emergencyRoutes"));
  app.use("/api/notifications", require("./routes/notificationRoutes"));
  app.use("/api/messages", require("./routes/messageRoutes"));

  app.use(notFound);
  app.use(errorHandler);
  return app;
};

module.exports = createApp;
