const {
  getContextOverview,
  listSessions,
  getSessionDetails,
  getImageCategorySummary,
  getMetricsSummary,
} = require("../services/admin.service");
const { setContextEnabled, getContextById } = require("../services/contexts.service");

async function getOverview(req, res) {
  try {
    const overview = await getContextOverview();
    res.json({ contexts: overview });
  } catch (err) {
    console.error("Admin overview error:", err);
    res.status(500).json({ error: "server_error" });
  }
}

async function getMetrics(req, res) {
  try {
    const metrics = await getMetricsSummary();
    res.json(metrics);
  } catch (err) {
    console.error("Admin metrics error:", err);
    res.status(500).json({ error: "server_error" });
  }
}

async function getSessions(req, res) {
  try {
    const status = req.query.status;
    const allowed = new Set(["in_progress", "completed", "all", undefined]);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: "Invalid status filter" });
    }

    const sessions = await listSessions(status);
    res.json({ sessions });
  } catch (err) {
    console.error("Admin sessions error:", err);
    res.status(500).json({ error: "server_error" });
  }
}

async function getSession(req, res) {
  try {
    const sessionId = req.params.id;
    const session = await getSessionDetails(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json({ session });
  } catch (err) {
    console.error("Admin session error:", err);
    res.status(500).json({ error: "server_error" });
  }
}

async function postContextEnabled(req, res) {
  try {
    const contextId = req.params.id;
    const enabled =
      typeof req.body?.enabled === "boolean" ? req.body.enabled : null;
    if (enabled === null) {
      return res.status(400).json({ error: "enabled must be boolean" });
    }

    const existing = await getContextById(contextId);
    if (!existing) {
      return res.status(404).json({ error: "Context not found" });
    }

    const updated = await setContextEnabled(contextId, enabled);
    res.json({ context: updated });
  } catch (err) {
    console.error("Admin context toggle error:", err);
    res.status(500).json({ error: "server_error" });
  }
}

async function getImagesSummary(req, res) {
  try {
    const categories = await getImageCategorySummary();
    res.json({ categories });
  } catch (err) {
    console.error("Admin images summary error:", err);
    res.status(500).json({ error: "server_error" });
  }
}

module.exports = {
  getOverview,
  getMetrics,
  getSessions,
  getSession,
  postContextEnabled,
  getImagesSummary,
};
