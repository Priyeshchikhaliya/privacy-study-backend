const { pool } = require("./pool");

async function migrate() {
  // You can add more migrations later; for now keep it simple.
  const sql = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
    context TEXT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,

    payload_draft JSONB NULL,
    payload_final JSONB NULL,

    payload_version INT NOT NULL DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  `;

  await pool.query(sql);
}

module.exports = { migrate };
