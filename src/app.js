const express = require("express");
const { healthRouter } = require("./routes/health.routes");
const { sessionsRouter } = require("./routes/sessions.routes");

function createApp() {
  const app = express();

  app.use(express.json({ limit: "10mb" }));

  app.use("/api", healthRouter);
  app.use("/api", sessionsRouter);

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // error handler
  app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };
