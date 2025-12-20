const { pool } = require("../db/pool");

async function listContexts() {
  const { rows } = await pool.query(
    `SELECT id, title, description, enabled FROM contexts ORDER BY id`
  );
  return rows;
}

async function getContextById(id) {
  const { rows } = await pool.query(
    `SELECT id, title, description, enabled FROM contexts WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function getEnabledContextsWithCompletedCounts() {
  const { rows } = await pool.query(
    `
    SELECT
      c.id,
      c.title,
      c.description,
      c.enabled,
      COALESCE(COUNT(s.*) FILTER (WHERE s.status = 'completed'), 0) AS completed_count
    FROM contexts c
    LEFT JOIN sessions s ON s.context = c.id
    WHERE c.enabled = true
    GROUP BY c.id, c.title, c.description, c.enabled
    ORDER BY c.id
    `
  );
  return rows;
}

async function setContextEnabled(id, enabled) {
  const { rows } = await pool.query(
    `
    UPDATE contexts
    SET enabled = $2
    WHERE id = $1
    RETURNING id, title, description, enabled
    `,
    [id, enabled]
  );
  return rows[0] || null;
}

module.exports = {
  listContexts,
  getContextById,
  getEnabledContextsWithCompletedCounts,
  setContextEnabled,
};
