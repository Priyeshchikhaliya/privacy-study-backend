const { Pool } = require("pg");
const { env } = require("../config/env");

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("Unexpected PG pool error", err);
});

module.exports = { pool };
