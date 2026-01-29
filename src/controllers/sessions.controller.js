const {
  createSession,
  getSessionById,
  getSessionWithImagesById,
  saveProgress,
  completeSession,
  startSessionWithImages,
} = require("../services/sessions.service");
const { CONTEXT_ID_SET } = require("../config/contexts");
const {
  getContextById,
  getEnabledContextsWithCompletedCounts,
} = require("../services/contexts.service");
const {
  progressPayloadSchema,
  completePayloadSchema,
} = require("../schemas/session.schemas");

const normalizeImageUrlValue = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed.startsWith("/images_v1/")) return trimmed;
  const match = trimmed.match(/\/images_v1\/[^?#]+(?:\?[^#]*)?/);
  return match ? match[0] : trimmed;
};

const normalizeDraftImageUrls = (draft) => {
  if (!draft || typeof draft !== "object") return draft;
  if (!Array.isArray(draft.images)) return draft;

  let changed = false;
  const nextImages = draft.images.map((img) => {
    if (!img || typeof img !== "object") return img;
    const next = { ...img };
    if ("imageUrl" in next) {
      const normalized = normalizeImageUrlValue(next.imageUrl);
      if (normalized !== next.imageUrl) {
        next.imageUrl = normalized;
        changed = true;
      }
    }
    if ("image_url" in next) {
      const normalized = normalizeImageUrlValue(next.image_url);
      if (normalized !== next.image_url) {
        next.image_url = normalized;
        changed = true;
      }
    }
    if ("src" in next) {
      const normalized = normalizeImageUrlValue(next.src);
      if (normalized !== next.src) {
        next.src = normalized;
        changed = true;
      }
    }
    return next;
  });

  if (!changed) return draft;
  return { ...draft, images: nextImages };
};

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
  }

  if (!scenario) {
    return res.status(409).json({ error: "No enabled contexts available" });
  }

  const out = await createSession({ context: scenario.id });
  res.status(201).json({
    session_id: out.session_id,
    context: scenario.id,
    scenario: {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      name: scenario.title,
      shortLabel: scenario.shortLabel || null,
      annotationLine: scenario.description,
    },
  });
}

const IMAGE_CATEGORIES = [
  "Education_knowledge",
  "Health_medical",
  "Household_children",
  "Intimate_private_space",
  "Lifestyle_habits",
  "Religion_culture",
  "SES_living_standard",
  "Work_from_home",
];

const ALLOWED_N = new Set([8, 16, 24]);

function parseNParam(value) {
  const parsed = Number.parseInt(value, 10);
  if (ALLOWED_N.has(parsed)) return parsed;
  return 8;
}

async function postStartSession(req, res) {
  let context =
    typeof req.body?.context === "string" ? req.body.context.trim() : "";
  if (context) {
    const existing = await getContextById(context);
    if (!existing) {
      return res.status(400).json({ error: "invalid_context" });
    }
    if (!existing.enabled) {
      return res.status(400).json({ error: "context_disabled" });
    }
  } else {
    const enabledContexts = await getEnabledContextsWithCompletedCounts();
    const scenario = pickBalancedContext(enabledContexts);
    if (!scenario) {
      return res.status(409).json({ error: "No enabled contexts available" });
    }
    context = scenario.id;
  }

  const nImages = parseNParam(req.query?.n);
  const perCategory = nImages / IMAGE_CATEGORIES.length;

  const existingSessionId = req.header("x-session-id");
  if (existingSessionId) {
    const existing = await getSessionWithImagesById(existingSessionId);
    if (existing && existing.status === "in_progress") {
      return res.json({ session: existing });
    }
  }

  const result = await startSessionWithImages({
    context,
    nImages,
    perCategory,
    categories: IMAGE_CATEGORIES,
    datasetVersion: "v1",
  });

  if (result?.error) {
    return res.status(409).json(result.error);
  }

  return res.status(201).json({ session: result });
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
          name: scenario.title,
          shortLabel: scenario.shortLabel || null,
          annotationLine: scenario.description,
        }
      : null,
    stage: session.stage,
    started_at: session.started_at,
    updated_at: session.updated_at,
    completed_at: session.completed_at,
  };

  if (includeDraft) {
    response.payload_draft = normalizeDraftImageUrls(
      session.payload_draft ?? null
    );
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

  const warnKeys = ["session_id", "started_at", "context"];
  const bodyKeys = req.body && typeof req.body === "object" ? req.body : {};
  const draftKeys =
    bodyKeys?.draft && typeof bodyKeys.draft === "object" ? bodyKeys.draft : {};
  const flagged = warnKeys.filter(
    (key) =>
      Object.prototype.hasOwnProperty.call(bodyKeys, key) ||
      Object.prototype.hasOwnProperty.call(draftKeys, key)
  );
  if (flagged.length > 0) {
    console.warn(
      `Progress patch includes discouraged keys for ${sessionId}: ${flagged.join(
        ", "
      )}`
    );
  }

  const session = await getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status === "completed") {
    return res.status(409).json({ error: "Session already completed" });
  }

  const updated = await saveProgress(sessionId, {
    stage: parsed.data.stage ?? null,
    draft: normalizeDraftImageUrls(parsed.data.draft ?? {}),
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
  postStartSession,
  getSession,
  putProgress,
  postComplete,
};
