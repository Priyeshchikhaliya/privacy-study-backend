const path = require("path");
const express = require("express");
const { healthRouter } = require("./routes/health.routes");
const { sessionsRouter } = require("./routes/sessions.routes");
const { scenariosRouter } = require("./routes/scenarios.routes");
const { adminRouter } = require("./routes/admin.routes");

function createApp() {
  const app = express();

  app.use(express.json({ limit: "10mb" }));

  app.use("/api", healthRouter);
  app.use("/api", scenariosRouter);
  app.use("/api", sessionsRouter);
  app.use("/api", adminRouter);

  app.use(
    "/images_v1",
    express.static(path.join(process.env.HOME, "images_v1_flat"), {
      fallthrough: false,
    }),
  );

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
