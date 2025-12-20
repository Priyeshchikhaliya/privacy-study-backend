require("dotenv").config();
const express = require("express");

const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

const port = process.env.PORT || 3001;
const host = "127.0.0.1"; // keep backend local; nginx will proxy

app.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`);
});
