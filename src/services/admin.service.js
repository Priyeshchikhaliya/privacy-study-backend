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
    GROUP BY c.id, c.title, c.description, c.enabled
    ORDER BY c.id
    `
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

module.exports = {
  getContextOverview,
  listSessions,
  getSessionDetails,
};
