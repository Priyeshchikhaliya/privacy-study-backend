const {
  getSessionById,
  getSessionAssignedImageIds,
  getSessionWithImagesById,
  saveProgress,
  completeSession,
  startSessionWithImages,
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

const getSubmittedImageIds = (images = []) =>
  (Array.isArray(images) ? images : [])
    .map((image) =>
      typeof image?.image_id === "string" ? image.image_id.trim() : ""
    )
    .filter((imageId) => imageId.length > 0);

const getDuplicateValues = (values = []) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }
  return [...duplicates];
};

async function validateSubmittedImagesForSession(
  sessionId,
  images,
  { requireExactSet = false } = {}
) {
  const submittedImageIds = getSubmittedImageIds(images);
  if (submittedImageIds.length === 0) return null;

  const duplicateImageIds = getDuplicateValues(submittedImageIds);
  if (duplicateImageIds.length > 0) {
    return {
      error: "duplicate_image_ids",
      details: { duplicate_image_ids: duplicateImageIds },
    };
  }

  const assignedImageIds = await getSessionAssignedImageIds(sessionId);
  const assignedSet = new Set(assignedImageIds);
  const unassignedImageIds = submittedImageIds.filter(
    (imageId) => !assignedSet.has(imageId)
  );
  if (unassignedImageIds.length > 0) {
    return {
      error: "unassigned_image_ids",
      details: { unassigned_image_ids: unassignedImageIds },
    };
  }

  if (!requireExactSet) return null;

  const submittedSet = new Set(submittedImageIds);
  const missingAssignedImageIds = assignedImageIds.filter(
    (imageId) => !submittedSet.has(imageId)
  );
  if (missingAssignedImageIds.length > 0) {
    return {
      error: "missing_assigned_image_ids",
      details: { missing_assigned_image_ids: missingAssignedImageIds },
    };
  }

  return null;
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

const ALLOWED_N = new Set([16]);

function parseNParam(value) {
  const parsed = Number.parseInt(value, 10);
  if (ALLOWED_N.has(parsed)) return parsed;
  return 16;
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
    n_images: Number.isInteger(Number(session.n_images))
      ? Number(session.n_images)
      : null,
    statement_order:
      Number(session.statement_order) === 1 || Number(session.statement_order) === 2
        ? Number(session.statement_order)
        : null,
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

  const draftPayload = (() => {
    if (parsed.data.draft && typeof parsed.data.draft === "object") {
      return parsed.data.draft;
    }

    const directDraft = {};
    if (Array.isArray(parsed.data.images)) {
      directDraft.images = parsed.data.images;
    }
    if (
      Object.prototype.hasOwnProperty.call(parsed.data, "obfuscation_evaluation")
    ) {
      directDraft.obfuscation_evaluation =
        parsed.data.obfuscation_evaluation ?? null;
    }
    if (parsed.data.demographics && typeof parsed.data.demographics === "object") {
      directDraft.demographics = parsed.data.demographics;
    }
    return directDraft;
  })();

  if (Array.isArray(draftPayload.images)) {
    const imageValidationError = await validateSubmittedImagesForSession(
      sessionId,
      draftPayload.images,
      { requireExactSet: false }
    );
    if (imageValidationError) {
      return res.status(400).json(imageValidationError);
    }
  }

  const updated = await saveProgress(sessionId, {
    stage: parsed.data.stage ?? null,
    draft: draftPayload,
  });
  if (!updated) {
    return res.status(404).json({ error: "Session not found" });
  }
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

  if (
    typeof session.context === "string" &&
    session.context &&
    parsed.data.context !== session.context
  ) {
    return res.status(400).json({
      error: "context mismatch",
      details: { session: session.context, payload: parsed.data.context },
    });
  }
  if (
    Number(session.statement_order) === 1 ||
    Number(session.statement_order) === 2
  ) {
    if (Number(parsed.data.statement_order) !== Number(session.statement_order)) {
      return res.status(400).json({
        error: "statement_order mismatch",
        details: {
          session: Number(session.statement_order),
          payload: Number(parsed.data.statement_order),
        },
      });
    }
  }
  if (
    Number.isInteger(Number(session.n_images)) &&
    Number(parsed.data.n_images) !== Number(session.n_images)
  ) {
    return res.status(400).json({
      error: "n_images mismatch",
      details: { session: Number(session.n_images), payload: parsed.data.n_images },
    });
  }

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

  const imageValidationError = await validateSubmittedImagesForSession(
    sessionId,
    parsed.data.images,
    { requireExactSet: true }
  );
  if (imageValidationError) {
    return res.status(400).json(imageValidationError);
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
  postStartSession,
  getSession,
  putProgress,
  postComplete,
};
