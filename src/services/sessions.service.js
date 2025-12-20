const { pool } = require("../db/pool");
const { v4: uuidv4 } = require("uuid");

async function createSession({ context = null } = {}) {
  const id = uuidv4();

  await pool.query(
    `INSERT INTO sessions (id, status, context) VALUES ($1, 'in_progress', $2)`,
    [id, context]
  );

  return { session_id: id };
}

async function getSessionById(sessionId) {
  const { rows } = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [
    sessionId,
  ]);
  return rows[0] || null;
}

async function saveProgress(sessionId, progressObject) {
  // Merge progress into payload_draft (JSONB merge).
  // If payload_draft is NULL, coalesce to {}.
  const { rows } = await pool.query(
    `
    UPDATE sessions
    SET payload_draft = COALESCE(payload_draft, '{}'::jsonb) || $2::jsonb,
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, status, updated_at
    `,
    [sessionId, JSON.stringify(progressObject)]
  );

  return rows[0] || null;
}

async function completeSession(sessionId, payloadFinal) {
  // Lock completion: only complete if currently in_progress
  const { rows } = await pool.query(
    `
    UPDATE sessions
    SET status = 'completed',
        payload_final = $2::jsonb,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1 AND status = 'in_progress'
    RETURNING id, status, completed_at
    `,
    [sessionId, JSON.stringify(payloadFinal)]
  );

  return rows[0] || null;
}

module.exports = {
  createSession,
  getSessionById,
  saveProgress,
  completeSession,
};
