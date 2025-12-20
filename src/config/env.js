require("dotenv").config();

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "127.0.0.1",
  databaseUrl: requireEnv("DATABASE_URL"),
};

module.exports = { env };
