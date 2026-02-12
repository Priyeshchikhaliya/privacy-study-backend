const { pool } = require("../db/pool");
const { v4: uuidv4 } = require("uuid");

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function createSession({ context = null } = {}) {
  const id = uuidv4();

  await pool.query(
    `INSERT INTO sessions (id, status, context) VALUES ($1, 'in_progress', $2)`,
    [id, context]
  );

  return { session_id: id, context };
}

async function getSessionById(sessionId) {
  const { rows } = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [
    sessionId,
  ]);
  return rows[0] || null;
}

async function getSessionWithImagesById(sessionId) {
  const { rows: sessionRows } = await pool.query(
    `
    SELECT id, status, context, n_images, dataset_version, started_at
    FROM sessions
    WHERE id = $1
    `,
    [sessionId]
  );
  const session = sessionRows[0] || null;
  if (!session || session.status !== "in_progress") return null;

  const { rows: imageRows } = await pool.query(
    `
    SELECT si.image_id, i.category, si.order_index, si.statement
    FROM session_images si
    JOIN images i ON i.image_id = si.image_id
    WHERE si.session_id = $1
    ORDER BY si.order_index ASC
    `,
    [sessionId]
  );
  if (!imageRows || imageRows.length === 0) return null;
  const halfPoint = Math.ceil((session.n_images || imageRows.length) / 2);
  const images = imageRows.map((row) => {
    const statement =
      Number(row.statement) === 1 || Number(row.statement) === 2
        ? Number(row.statement)
        : row.order_index < halfPoint
          ? 1
          : 2;
    return {
      image_id: row.image_id,
      category: row.category,
      order_index: row.order_index,
      statement,
    };
  });

  return {
    id: session.id,
    status: session.status,
    context: session.context,
    n_images: session.n_images,
    dataset_version: session.dataset_version,
    started_at: session.started_at,
    images,
  };
}

async function startSessionWithImages({
  context,
  nImages,
  perCategory,
  categories,
  datasetVersion,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const selected = [];

    for (const category of categories) {
      const { rows } = await client.query(
        `
        SELECT image_id, category
        FROM images
        WHERE enabled = true AND category = $1
        ORDER BY completed_count ASC, random()
        LIMIT $2
        FOR UPDATE SKIP LOCKED
        `,
        [category, perCategory]
      );

      if (!rows || rows.length < perCategory) {
        const { rows: countRows } = await client.query(
          `
          SELECT COUNT(*)::int AS available
          FROM images
          WHERE enabled = true AND category = $1
          `,
          [category]
        );
        await client.query("ROLLBACK");
        return {
          error: {
            error: "insufficient_images",
            category,
            needed: perCategory,
            available: countRows[0]?.available ?? 0,
          },
        };
      }
      selected.push(...rows);
    }

    const shuffled = shuffleArray(selected);
    const sessionId = uuidv4();
    const firstStatement = Math.random() < 0.5 ? 1 : 2;
    const secondStatement = firstStatement === 1 ? 2 : 1;
    const halfPoint = Math.ceil(nImages / 2);

    const { rows: sessionRows } = await client.query(
      `
      INSERT INTO sessions (
        id,
        status,
        context,
        stage,
        started_at,
        updated_at,
        n_images,
        dataset_version
      )
      VALUES ($1, 'in_progress', $2, $3, NOW(), NOW(), $4, $5)
      RETURNING id, status, context, n_images, dataset_version, started_at
      `,
      [sessionId, context, "annotate_started", nImages, datasetVersion]
    );
    const session = sessionRows[0];

    if (shuffled.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;
      shuffled.forEach((img, orderIndex) => {
        const statement = orderIndex < halfPoint ? firstStatement : secondStatement;
        values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, NOW())`);
        params.push(sessionId, img.image_id, orderIndex, statement);
      });

      await client.query(
        `
        INSERT INTO session_images (session_id, image_id, order_index, statement, assigned_at)
        VALUES ${values.join(", ")}
        `,
        params
      );

      const imageIds = shuffled.map((img) => img.image_id);
      await client.query(
        `
        UPDATE images
        SET assigned_count = assigned_count + 1,
            last_assigned_at = NOW()
        WHERE image_id = ANY($1::text[])
        `,
        [imageIds]
      );
    }

    await client.query("COMMIT");

    const images = shuffled.map((img, orderIndex) => ({
      image_id: img.image_id,
      category: img.category,
      order_index: orderIndex,
      statement: orderIndex < halfPoint ? firstStatement : secondStatement,
    }));

    return {
      id: session.id,
      status: session.status,
      context: session.context,
      n_images: session.n_images,
      dataset_version: session.dataset_version,
      started_at: session.started_at,
      images,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function saveProgress(sessionId, { stage = null, draft = {} } = {}) {
  // Merge progress into payload_draft (JSONB merge).
  // If payload_draft is NULL, coalesce to {}.
  const { rows } = await pool.query(
    `
    UPDATE sessions
    SET payload_draft = COALESCE(payload_draft, '{}'::jsonb) || $2::jsonb,
        stage = COALESCE($3, stage),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, status, updated_at
    `,
    [sessionId, JSON.stringify(draft || {}), stage]
  );

  return rows[0] || null;
}

async function completeSession(sessionId, payloadFinal) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock completion: only complete if currently in_progress
    const { rows } = await client.query(
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

    const result = rows[0] || null;
    if (!result) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `
      UPDATE session_images
      SET completed_at = NOW()
      WHERE session_id = $1 AND completed_at IS NULL
      `,
      [sessionId]
    );

    await client.query(
      `
      UPDATE images
      SET completed_count = completed_count + 1
      WHERE image_id IN (
        SELECT image_id
        FROM session_images
        WHERE session_id = $1
      )
      `,
      [sessionId]
    );

    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createSession,
  getSessionById,
  getSessionWithImagesById,
  startSessionWithImages,
  saveProgress,
  completeSession,
};
