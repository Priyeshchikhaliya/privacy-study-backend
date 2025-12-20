const {
  createSession,
  getSessionById,
  saveProgress,
  completeSession,
} = require("../services/sessions.service");
const {
  progressPayloadSchema,
  completePayloadSchema,
} = require("../schemas/session.schemas");

async function postCreateSession(req, res) {
  const context =
    typeof req.body?.context === "string" ? req.body.context : null;
  const out = await createSession({ context });
  res.status(201).json(out);
}

async function putProgress(req, res) {
  const sessionId = req.params.id;

  const parsed = progressPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid progress payload",
      details: parsed.error.flatten(),
    });
  }

  const session = await getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status === "completed") {
    return res.status(409).json({ error: "Session already completed" });
  }

  const updated = await saveProgress(sessionId, parsed.data);
  res.json({ ok: true, session_id: sessionId, updated_at: updated.updated_at });
}

async function postComplete(req, res) {
  const sessionId = req.params.id;

  const parsed = completePayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid completion payload",
      details: parsed.error.flatten(),
    });
  }

  // Ensure payload session_id matches URL session id
  if (parsed.data.session_id !== sessionId) {
    return res.status(400).json({
      error: "session_id mismatch",
      details: { url: sessionId, body: parsed.data.session_id },
    });
  }

  const session = await getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  if (session.status === "completed") {
    // idempotent-ish: return success without rewriting
    return res.json({ ok: true, session_id: sessionId, status: "completed" });
  }

  const result = await completeSession(sessionId, parsed.data);
  if (!result) {
    return res.status(409).json({ error: "Could not complete session" });
  }

  res.json({
    ok: true,
    session_id: sessionId,
    status: "completed",
    completed_at: result.completed_at,
  });
}

module.exports = {
  postCreateSession,
  putProgress,
  postComplete,
};
