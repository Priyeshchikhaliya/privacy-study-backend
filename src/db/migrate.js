const { pool } = require("./pool");
const { CONTEXTS } = require("../config/contexts");

async function migrate() {
  // You can add more migrations later; for now keep it simple.
  const sql = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
    context TEXT NULL,
    stage TEXT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,

    payload_draft JSONB NULL,
    payload_final JSONB NULL,

    payload_version INT NOT NULL DEFAULT 1
  );

  ALTER TABLE IF EXISTS sessions
    ADD COLUMN IF NOT EXISTS stage TEXT NULL;

  CREATE TABLE IF NOT EXISTS contexts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_context ON sessions(context);
  `;

  await pool.query(sql);

  for (const context of CONTEXTS) {
    await pool.query(
      `
      INSERT INTO contexts (id, title, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            description = EXCLUDED.description
      `,
      [context.id, context.title, context.description]
    );
  }
}

module.exports = { migrate };
