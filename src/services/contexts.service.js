const { CONTEXT_IDS, CONTEXT_ID_SET } = require("../config/contexts");
const { pool } = require("../db/pool");

async function listContexts() {
  const { rows } = await pool.query(
    `
    SELECT id, title, description, short_label AS "shortLabel", enabled
    FROM contexts
    WHERE id = ANY($1)
    ORDER BY id
    `,
    [CONTEXT_IDS]
  );
  return rows;
}

async function getContextById(id) {
  if (!id || !CONTEXT_ID_SET.has(id)) return null;
  const { rows } = await pool.query(
    `
    SELECT id, title, description, short_label AS "shortLabel", enabled
    FROM contexts
    WHERE id = $1
    `,
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
      c.short_label AS "shortLabel",
      c.enabled,
      COALESCE(COUNT(s.*) FILTER (WHERE s.status = 'completed'), 0) AS completed_count
    FROM contexts c
    LEFT JOIN sessions s ON s.context = c.id
    WHERE c.enabled = true
      AND c.id = ANY($1)
    GROUP BY c.id, c.title, c.description, c.short_label, c.enabled
    ORDER BY c.id
    `
    ,
    [CONTEXT_IDS]
  );
  return rows;
}

async function setContextEnabled(id, enabled) {
  const { rows } = await pool.query(
    `
    UPDATE contexts
    SET enabled = $2
    WHERE id = $1
    RETURNING id, title, description, short_label AS "shortLabel", enabled
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
