const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  postCreateSession,
  getSession,
  putProgress,
  postComplete,
} = require("../controllers/sessions.controller");

const router = express.Router();

router.post("/sessions", asyncHandler(postCreateSession));
router.get("/sessions/:id", asyncHandler(getSession));
router.put("/sessions/:id/progress", asyncHandler(putProgress));
router.post("/sessions/:id/complete", asyncHandler(postComplete));

module.exports = { sessionsRouter: router };
