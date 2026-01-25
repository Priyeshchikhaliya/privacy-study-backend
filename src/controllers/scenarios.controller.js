const { listContexts } = require("../services/contexts.service");

async function listScenarios(req, res) {
  const contexts = await listContexts();
  res.json({
    scenarios: contexts.map((context) => ({
      id: context.id,
      title: context.title,
      description: context.description,
      name: context.title,
      shortLabel: context.shortLabel || null,
      annotationLine: context.description,
      enabled: context.enabled,
    })),
  });
}

module.exports = { listScenarios };
