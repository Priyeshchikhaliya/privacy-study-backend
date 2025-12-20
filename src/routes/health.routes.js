const express = require("express");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

module.exports = { healthRouter: router };
