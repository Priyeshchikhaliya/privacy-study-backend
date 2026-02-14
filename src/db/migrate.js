const { pool } = require("./pool");
const { CONTEXTS, CONTEXT_IDS } = require("../config/contexts");

async function migrate() {
  // Single migration file, idempotent and safe to re-run
  const sql = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  -- =====================
  -- Sessions
  -- =====================
  CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
    context TEXT NULL,
    stage TEXT NULL,
    n_images INTEGER,
    dataset_version TEXT,
    statement_order SMALLINT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,

    payload_draft JSONB NULL,
    payload_final JSONB NULL,

    payload_version INT NOT NULL DEFAULT 1
  );

  -- Keep table shape resilient if a partial schema exists.
  ALTER TABLE IF EXISTS sessions
    ADD COLUMN IF NOT EXISTS stage TEXT NULL,
    ADD COLUMN IF NOT EXISTS n_images INTEGER,
    ADD COLUMN IF NOT EXISTS dataset_version TEXT,
    ADD COLUMN IF NOT EXISTS statement_order SMALLINT;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'sessions_statement_order_check'
    ) THEN
      ALTER TABLE sessions
        ADD CONSTRAINT sessions_statement_order_check
        CHECK (statement_order IS NULL OR statement_order IN (1, 2));
    END IF;
  END $$;

  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_context ON sessions(context);

  -- =====================
  -- Contexts
  -- =====================
  CREATE TABLE IF NOT EXISTS contexts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    short_label TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT true
  );

  ALTER TABLE IF EXISTS contexts
    ADD COLUMN IF NOT EXISTS short_label TEXT NOT NULL DEFAULT '';

  -- =====================
  -- Dataset v1 tables
  -- =====================
  CREATE TABLE IF NOT EXISTS images (
    image_id TEXT PRIMARY KEY,                 -- exact filename incl. extension
    category TEXT NOT NULL,
    assigned_count INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0,
    last_assigned_at TIMESTAMPTZ,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS session_images (
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    image_id TEXT NOT NULL REFERENCES images(image_id),
    order_index INTEGER NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    PRIMARY KEY (session_id, image_id)
  );

  CREATE INDEX IF NOT EXISTS idx_session_images_image_id
    ON session_images(image_id);

  -- =====================
  -- Legacy cleanup
  -- =====================
  ALTER TABLE IF EXISTS sessions
    DROP CONSTRAINT IF EXISTS sessions_first_statement_check;

  ALTER TABLE IF EXISTS sessions
    DROP COLUMN IF EXISTS first_statement;

  ALTER TABLE IF EXISTS images
    DROP COLUMN IF EXISTS statement1_assigned_count,
    DROP COLUMN IF EXISTS statement2_assigned_count;

  ALTER TABLE IF EXISTS session_images
    DROP CONSTRAINT IF EXISTS session_images_statement_check;

  ALTER TABLE IF EXISTS session_images
    DROP COLUMN IF EXISTS statement,
    DROP COLUMN IF EXISTS statement_order;

  DROP TABLE IF EXISTS annotations;
  `;

  await pool.query(sql);

  // =====================
  // Seed / sync contexts
  // =====================
  for (const context of CONTEXTS) {
    await pool.query(
      `
      INSERT INTO contexts (id, title, description, short_label)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            description = EXCLUDED.description,
            short_label = EXCLUDED.short_label
      `,
      [
        context.id,
        context.title,
        context.description,
        context.shortLabel || "",
      ],
    );
  }

  if (CONTEXT_IDS.length > 0) {
    await pool.query(
      `
      DELETE FROM contexts
      WHERE NOT (id = ANY($1))
      `,
      [CONTEXT_IDS],
    );
  }
}

if (require.main === module) {
  require("dotenv").config();
  migrate()
    .then(() => {
      console.log("Migration complete ✅");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed ❌", err);
      process.exit(1);
    });
}

module.exports = { migrate };
