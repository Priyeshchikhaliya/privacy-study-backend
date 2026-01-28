// src/db/seed_images_from_folders.js
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const { pool } = require("./pool");

const DATASET_ROOT = process.env.DATASET_ROOT || path.join(process.env.HOME, "Final Dataset");

const ALLOWED_CATEGORIES = [
  "Education_knowledge",
  "Health_medical",
  "Household_children",
  "Intimate_private_space",
  "Lifestyle_habits",
  "Religion_culture",
  "SES_living_standard",
  "Work_from_home",
];

const IMAGE_EXT_RE = /\.(jpg|jpeg|png)$/i;

async function main() {
  console.log("Seeding images from:", DATASET_ROOT);

  // sanity: ensure folders exist
  for (const cat of ALLOWED_CATEGORIES) {
    const dir = path.join(DATASET_ROOT, cat);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error(`Missing category folder: ${dir}`);
    }
  }

  // collect rows
  const rows = [];
  for (const cat of ALLOWED_CATEGORIES) {
    const dir = path.join(DATASET_ROOT, cat);
    const files = fs.readdirSync(dir).filter((f) => IMAGE_EXT_RE.test(f));
    for (const filename of files) {
      rows.push({ image_id: filename, category: cat });
    }
  }

  console.log("Found image files (allowed categories):", rows.length);

  // insert transactionally
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const r of rows) {
      await client.query(
        `
        INSERT INTO images (image_id, category)
        VALUES ($1, $2)
        ON CONFLICT (image_id) DO NOTHING
        `,
        [r.image_id, r.category]
      );
    }

    await client.query("COMMIT");
    console.log("Seed complete ✅");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main().catch((e) => {
  console.error("Seed failed ❌", e);
  process.exit(1);
});
