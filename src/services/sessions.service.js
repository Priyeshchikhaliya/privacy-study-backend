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

function toCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStatementBalanceCost(image, statement) {
  let s1 = toCount(image?.statement1_assigned_count);
  let s2 = toCount(image?.statement2_assigned_count);

  if (statement === 1) s1 += 1;
  if (statement === 2) s2 += 1;

  return Math.abs(s1 - s2);
}

function buildStatementBalancedOrder(
  selected,
  categories,
  perCategory,
  firstStatement
) {
  if (!Array.isArray(selected) || selected.length === 0) return [];
  if (!Array.isArray(categories) || categories.length === 0) {
    return shuffleArray(selected);
  }

  // Required study setup: 2 images per category (total 16 across 8 categories).
  if (!Number.isInteger(perCategory) || perCategory !== 2) {
    return shuffleArray(selected);
  }

  const grouped = new Map(categories.map((category) => [category, []]));
  selected.forEach((img) => {
    const key = img?.category;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(img);
  });

  const hasExactPairPerCategory = categories.every(
    (category) => (grouped.get(category) || []).length === 2
  );
  if (!hasExactPairPerCategory) {
    return shuffleArray(selected);
  }

  const normalizedFirstStatement = firstStatement === 2 ? 2 : 1;
  const secondStatement = normalizedFirstStatement === 1 ? 2 : 1;
  const firstBlock = [];
  const secondBlock = [];

  categories.forEach((category) => {
    const pair = shuffleArray(grouped.get(category));
    const [a, b] = pair;

    const optionACost =
      getStatementBalanceCost(a, normalizedFirstStatement) +
      getStatementBalanceCost(b, secondStatement);
    const optionBCost =
      getStatementBalanceCost(b, normalizedFirstStatement) +
      getStatementBalanceCost(a, secondStatement);

    if (optionACost < optionBCost) {
      firstBlock.push(a);
      secondBlock.push(b);
      return;
    }

    if (optionBCost < optionACost) {
      firstBlock.push(b);
      secondBlock.push(a);
      return;
    }

    if (Math.random() < 0.5) {
      firstBlock.push(a);
      secondBlock.push(b);
    } else {
      firstBlock.push(b);
      secondBlock.push(a);
    }
  });

  return [...shuffleArray(firstBlock), ...shuffleArray(secondBlock)];
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
    SELECT id, status, context, n_images, dataset_version, started_at, first_statement
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
    first_statement:
      Number(session.first_statement) === 1 || Number(session.first_statement) === 2
        ? Number(session.first_statement)
        : null,
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
        SELECT image_id, category, assigned_count, completed_count,
               statement1_assigned_count, statement2_assigned_count
        FROM images
        WHERE enabled = true AND category = $1
        ORDER BY assigned_count ASC, completed_count ASC, random()
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

    const sessionId = uuidv4();
    const firstStatement = Math.random() < 0.5 ? 1 : 2;
    const secondStatement = firstStatement === 1 ? 2 : 1;
    const halfPoint = Math.ceil(nImages / 2);
    const orderedImages = buildStatementBalancedOrder(
      selected,
      categories,
      perCategory,
      firstStatement
    );

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
        dataset_version,
        first_statement
      )
      VALUES ($1, 'in_progress', $2, $3, NOW(), NOW(), $4, $5, $6)
      RETURNING id, status, context, n_images, dataset_version, started_at, first_statement
      `,
      [sessionId, context, "annotate_started", nImages, datasetVersion, firstStatement]
    );
    const session = sessionRows[0];

    if (orderedImages.length > 0) {
      const values = [];
      const params = [];
      const assignedPairs = [];
      let idx = 1;
      orderedImages.forEach((img, orderIndex) => {
        const statement = orderIndex < halfPoint ? firstStatement : secondStatement;
        values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, NOW())`);
        params.push(sessionId, img.image_id, orderIndex, statement);
        assignedPairs.push({ image_id: img.image_id, statement });
      });

      await client.query(
        `
        INSERT INTO session_images (session_id, image_id, order_index, statement, assigned_at)
        VALUES ${values.join(", ")}
        `,
        params
      );

      const assignmentValues = [];
      const assignmentParams = [];
      let assignmentIdx = 1;
      assignedPairs.forEach((entry) => {
        assignmentValues.push(
          `($${assignmentIdx++}::text, $${assignmentIdx++}::smallint)`
        );
        assignmentParams.push(entry.image_id, entry.statement);
      });

      await client.query(
        `
        UPDATE images AS i
        SET assigned_count = i.assigned_count + 1,
            statement1_assigned_count = i.statement1_assigned_count +
              CASE WHEN a.statement = 1 THEN 1 ELSE 0 END,
            statement2_assigned_count = i.statement2_assigned_count +
              CASE WHEN a.statement = 2 THEN 1 ELSE 0 END,
            last_assigned_at = NOW()
        FROM (VALUES ${assignmentValues.join(", ")}) AS a(image_id, statement)
        WHERE i.image_id = a.image_id
        `,
        assignmentParams
      );
    }

    await client.query("COMMIT");

    const images = orderedImages.map((img, orderIndex) => ({
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
      first_statement: firstStatement,
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
