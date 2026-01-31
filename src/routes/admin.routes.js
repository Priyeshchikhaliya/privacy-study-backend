const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAdmin } = require("../middleware/requireAdmin");
const {
  getOverview,
  getSessions,
  getSession,
  postContextEnabled,
  getImagesSummary,
  getImagesByCategory,
  getImageSessions,
  getMetrics,
} = require("../controllers/admin.controller");

const router = express.Router();

router.use(requireAdmin);
router.get("/admin/overview", asyncHandler(getOverview));
router.get("/admin/metrics", asyncHandler(getMetrics));
router.get("/admin/sessions", asyncHandler(getSessions));
router.get("/admin/sessions/:id", asyncHandler(getSession));
router.post("/admin/contexts/:id/enabled", asyncHandler(postContextEnabled));
router.get("/admin/images/summary", asyncHandler(getImagesSummary));
router.get("/admin/images", asyncHandler(getImagesByCategory));
router.get("/admin/images/:imageId/sessions", asyncHandler(getImageSessions));

module.exports = { adminRouter: router };
