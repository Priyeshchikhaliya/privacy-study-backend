const { CONTEXT_IDS } = require("../config/contexts");
const { pool } = require("../db/pool");

async function getContextOverview() {
  const { rows } = await pool.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.enabled,
      COUNT(s.*) FILTER (WHERE s.status = 'completed') AS completed,
      COUNT(s.*) FILTER (WHERE s.status = 'in_progress') AS in_progress,
      COUNT(s.*) AS total
    FROM contexts c
    LEFT JOIN sessions s ON s.context = c.id
    WHERE c.id = ANY($1)
    GROUP BY c.id, c.title, c.description, c.enabled
    ORDER BY c.id
    `,
    [CONTEXT_IDS]
  );
  return rows;
}

async function listSessions(status) {
  const params = [];
  let whereClause = "";
  if (status && status !== "all") {
    params.push(status);
    whereClause = "WHERE status = $1";
  }

  const { rows } = await pool.query(
    `
    SELECT id, status, context, stage, started_at, updated_at, completed_at
    FROM sessions
    ${whereClause}
    ORDER BY started_at DESC
    `,
    params
  );
  return rows;
}

async function getSessionDetails(sessionId) {
  const { rows } = await pool.query(
    `
    SELECT id, status, context, stage, started_at, updated_at, completed_at,
           payload_draft, payload_final
    FROM sessions
    WHERE id = $1
    `,
    [sessionId]
  );
  return rows[0] || null;
}

async function getImageCategorySummary() {
  const { rows } = await pool.query(
    `
    SELECT
      category,
      COUNT(*) FILTER (WHERE enabled = true)::int AS enabled_images,
      COALESCE(SUM(assigned_count), 0)::int AS assigned_sum,
      COALESCE(SUM(completed_count), 0)::int AS completed_sum
    FROM images
    GROUP BY category
    ORDER BY category ASC
    `
  );
  return rows;
}

async function getMetricsSummary() {
  const { rows } = await pool.query(
    `
    SELECT
      COUNT(*)::int AS completed_sessions,
      CASE
        WHEN COUNT(*) = 0 THEN NULL
        ELSE ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::numeric, 2)::float8
      END AS avg_completion_minutes
    FROM sessions
    WHERE completed_at IS NOT NULL
      AND started_at IS NOT NULL
    `
  );
  return rows[0] || { avg_completion_minutes: null, completed_sessions: 0 };
}

module.exports = {
  getContextOverview,
  listSessions,
  getSessionDetails,
  getImageCategorySummary,
  getMetricsSummary,
};
