const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/requireAdmin");
const {
  getOverview,
  getSessions,
  getSession,
  postContextEnabled,
} = require("../controllers/admin.controller");

const router = express.Router();

router.use(requireAdmin);
router.get("/admin/overview", asyncHandler(getOverview));
router.get("/admin/sessions", asyncHandler(getSessions));
router.get("/admin/sessions/:id", asyncHandler(getSession));
router.post("/admin/contexts/:id/enabled", asyncHandler(postContextEnabled));

module.exports = { adminRouter: router };
