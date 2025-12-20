const {
  getContextOverview,
  listSessions,
  getSessionDetails,
} = require("../services/admin.service");
const { setContextEnabled, getContextById } = require("../services/contexts.service");

async function getOverview(req, res) {
  const overview = await getContextOverview();
  res.json({ contexts: overview });
}

async function getSessions(req, res) {
  const status = req.query.status;
  const allowed = new Set(["in_progress", "completed", "all", undefined]);
  if (!allowed.has(status)) {
    return res.status(400).json({ error: "Invalid status filter" });
  }

  const sessions = await listSessions(status);
  res.json({ sessions });
}

async function getSession(req, res) {
  const sessionId = req.params.id;
  const session = await getSessionDetails(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ session });
}

async function postContextEnabled(req, res) {
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
}

module.exports = {
  getOverview,
  getSessions,
  getSession,
  postContextEnabled,
};
