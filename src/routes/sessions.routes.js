const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  postCreateSession,
  postStartSession,
  getSession,
  putProgress,
  postComplete,
} = require("../controllers/sessions.controller");

const router = express.Router();
const publicRouter = express.Router();

router.post("/session/start", asyncHandler(postStartSession));
router.post("/sessions", asyncHandler(postCreateSession));
router.get("/sessions/:id", asyncHandler(getSession));
router.put("/sessions/:id/progress", asyncHandler(putProgress));
router.post("/sessions/:id/complete", asyncHandler(postComplete));

publicRouter.post("/start", asyncHandler(postStartSession));

module.exports = { sessionsRouter: router, publicSessionRouter: publicRouter };
