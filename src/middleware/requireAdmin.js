const { env } = require("../config/env");

function requireAdmin(req, res, next) {
  const adminId = req.header("x-admin-id");
  const adminPassword = req.header("x-admin-password");
  if (
    !adminId ||
    !adminPassword ||
    adminId !== env.adminId ||
    adminPassword !== env.adminPassword
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

module.exports = { requireAdmin };
