const { env } = require("./config/env");
const { createApp } = require("./app");
const { migrate } = require("./db/migrate");

async function main() {
  await migrate();

  const app = createApp();

  app.listen(env.port, env.host, () => {
    console.log(`Backend listening on http://${env.host}:${env.port}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
