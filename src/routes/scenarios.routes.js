const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { listScenarios } = require("../controllers/scenarios.controller");

const router = express.Router();

router.get("/scenarios", asyncHandler(listScenarios));

module.exports = { scenariosRouter: router };
