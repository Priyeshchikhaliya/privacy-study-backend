const {
  createSession,
  getSessionById,
  saveProgress,
  completeSession,
} = require("../services/sessions.service");
const {
  getContextById,
  getEnabledContextsWithCompletedCounts,
} = require("../services/contexts.service");
const {
  progressPayloadSchema,
  completePayloadSchema,
} = require("../schemas/session.schemas");

function pickBalancedContext(rows) {
  if (!rows || rows.length === 0) return null;
  const minCount = Math.min(
    ...rows.map((row) => Number(row.completed_count || 0))
  );
  const candidates = rows.filter(
    (row) => Number(row.completed_count || 0) === minCount
  );
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx] || null;
}

async function postCreateSession(req, res) {
  const context =
    typeof req.body?.context === "string" ? req.body.context.trim() : null;

  let scenario = null;
  if (context) {
    const existing = await getContextById(context);
    if (!existing) {
      return res.status(400).json({ error: "Unknown context id" });
    }
    if (!existing.enabled) {
      return res.status(400).json({ error: "Context is disabled" });
    }
    scenario = existing;
  } else {
    const enabledContexts = await getEnabledContextsWithCompletedCounts();
    scenario = pickBalancedContext(enabledContexts);
    if (!scenario) {
      return res.status(409).json({ error: "No enabled contexts available" });
    }
  }

  const out = await createSession({ context: scenario.id });
  res.status(201).json({
    session_id: out.session_id,
    context: scenario.id,
    scenario: {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
    },
  });
}

async function getSession(req, res) {
  const sessionId = req.params.id;
  const includeDraft = req.query.includeDraft === "1";
  const session = await getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const scenario = session.context
    ? await getContextById(session.context)
    : null;

  const response = {
    session_id: session.id,
    status: session.status,
    context: session.context,
    scenario: scenario
      ? {
          id: scenario.id,
          title: scenario.title,
          description: scenario.description,
        }
      : null,
    stage: session.stage,
    started_at: session.started_at,
    updated_at: session.updated_at,
    completed_at: session.completed_at,
  };

  if (includeDraft) {
    response.payload_draft = session.payload_draft ?? null;
  }

  res.json(response);
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

  const updated = await saveProgress(sessionId, {
    stage: parsed.data.stage ?? null,
    draft: parsed.data.draft ?? {},
  });
  res.json({
    ok: true,
    session_id: sessionId,
    updated_at: updated.updated_at,
  });
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
    return res.json({
      ok: true,
      session_id: sessionId,
      status: "completed",
      alreadyCompleted: true,
      completed_at: session.completed_at,
    });
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
  getSession,
  putProgress,
  postComplete,
};
