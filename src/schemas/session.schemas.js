const { z } = require("zod");

const bboxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .strict();

const LEGACY_APPROPRIATENESS_VALUES = [
  "slightly_inappropriate",
  "moderately_inappropriate",
  "very_inappropriate",
  "completely_inappropriate",
  "slightly_appropriate",
  "moderately_appropriate",
  "very_appropriate",
  "completely_appropriate",
  "difficult_to_say",
];

const LEGACY_STATEMENT1_VALUES = [
  "slightly_inappropriate",
  "moderately_inappropriate",
  "very_inappropriate",
  "completely_inappropriate",
  "difficult_to_say",
];

const LEGACY_STATEMENT2_VALUES = [
  "slightly_appropriate",
  "moderately_appropriate",
  "very_appropriate",
  "completely_appropriate",
  "difficult_to_say",
];

const SENSITIVITY_VALUES = [
  "slightly_sensitive",
  "moderately_sensitive",
  "very_sensitive",
  "extremely_sensitive",
  "difficult_to_say",
];

const COMFORT_VALUES = [
  "slightly_comfortable",
  "moderately_comfortable",
  "very_comfortable",
  "completely_comfortable",
  "difficult_to_say",
];

const INFORMATION_TYPE_VALUES = [
  "identity",
  "location_address",
  "financial",
  "health_medical",
  "children_family",
  "religious_cultural",
  "intimate_spaces",
  "work_related",
  "lifestyle_habits",
  "others_info",
  "other_specify",
];

const OTHER_INFORMATION_MIN_LENGTH = 3;

const obfuscationMethodSchema = z.enum(["blackbox", "blur", "censor", "avatar"]);
const statementOrderSchema = z.union([z.literal(1), z.literal(2)]);
const legacyAppropriatenessSchema = z.enum(LEGACY_APPROPRIATENESS_VALUES);
const sensitivitySchema = z.enum(SENSITIVITY_VALUES);
const comfortSchema = z.enum(COMFORT_VALUES);
const informationTypeSchema = z.enum(INFORMATION_TYPE_VALUES);

const validateOtherInformation = (region, ctx) => {
  const informationTypes = Array.isArray(region?.information_types)
    ? region.information_types
    : [];
  if (!informationTypes.includes("other_specify")) return;

  const otherText =
    typeof region?.other_information === "string"
      ? region.other_information.trim()
      : "";
  if (otherText.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["other_information"],
      message: "other_information is required when other_specify is selected.",
    });
    return;
  }
  if (otherText.length < OTHER_INFORMATION_MIN_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["other_information"],
      message: `other_information must be at least ${OTHER_INFORMATION_MIN_LENGTH} characters.`,
    });
  }
};

const finalizedRegionBaseSchema = z
  .object({
    region_id: z.string().min(1),
    bbox: bboxSchema,
    sensitivity_rating: sensitivitySchema.optional(),
    comfort_rating: comfortSchema.optional(),
    // Legacy fallback for clients that still submit appropriateness_rating.
    appropriateness_rating: legacyAppropriatenessSchema.optional(),
    information_types: z.array(informationTypeSchema).min(1),
    other_information: z.string().optional(),
  })
  .strict();

const statement1RegionSchema = finalizedRegionBaseSchema.superRefine(
  (region, ctx) => {
    const hasCurrent = typeof region?.sensitivity_rating === "string";
    const hasLegacy =
      typeof region?.appropriateness_rating === "string" &&
      LEGACY_STATEMENT1_VALUES.includes(region.appropriateness_rating);

    if (!hasCurrent && !hasLegacy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sensitivity_rating"],
        message:
          "statement1 region must include sensitivity_rating (or legacy appropriateness_rating).",
      });
    }

    validateOtherInformation(region, ctx);
  }
);

const statement2RegionSchema = finalizedRegionBaseSchema.superRefine(
  (region, ctx) => {
    const hasCurrent = typeof region?.comfort_rating === "string";
    const hasLegacy =
      typeof region?.appropriateness_rating === "string" &&
      LEGACY_STATEMENT2_VALUES.includes(region.appropriateness_rating);

    if (!hasCurrent && !hasLegacy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comfort_rating"],
        message:
          "statement2 region must include comfort_rating (or legacy appropriateness_rating).",
      });
    }

    validateOtherInformation(region, ctx);
  }
);

const draftRegionBaseSchema = z
  .object({
    region_id: z.string().min(1),
    bbox: bboxSchema,
    sensitivity_rating: sensitivitySchema.nullable().optional(),
    comfort_rating: comfortSchema.nullable().optional(),
    appropriateness_rating: legacyAppropriatenessSchema.nullable().optional(),
    information_types: z.array(informationTypeSchema).optional().default([]),
    other_information: z.string().optional(),
  })
  .strict();

const draftStatement1RegionSchema = draftRegionBaseSchema;
const draftStatement2RegionSchema = draftRegionBaseSchema;

const finalizedImageSchema = z
  .object({
    image_id: z.string().min(1),
    overall_sensitivity: z.number().int().min(1).max(4),
    statement1_regions: z.array(statement1RegionSchema),
    statement2_regions: z.array(statement2RegionSchema),
    obfuscation_method: obfuscationMethodSchema.nullable().optional(),
  })
  .strict()
  .superRefine((image, ctx) => {
    if (image.statement1_regions.length === 0) return;
    const methods = image.obfuscation_method ? [image.obfuscation_method] : [];
    if (methods.length > 0) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["obfuscation_method"],
      message:
        "An obfuscation method is required when statement1_regions has at least one region.",
    });
  });

const draftImageSchema = z
  .object({
    image_id: z.string().min(1),
    overall_sensitivity: z.number().int().min(1).max(4).nullable().optional(),
    statement1_regions: z.array(draftStatement1RegionSchema).default([]),
    statement2_regions: z.array(draftStatement2RegionSchema).default([]),
    obfuscation_method: obfuscationMethodSchema.nullable().optional(),
  })
  .strict();

const ATI_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"];
const IUIPC_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];

const buildLikertSchema = (keys) =>
  z
    .object(
      Object.fromEntries(keys.map((key) => [key, z.number().int().min(1).max(7)]))
    )
    .strict();

const isLikertMapEqual = (a, b, keys) =>
  keys.every((key) => Number(a?.[key]) === Number(b?.[key]));

const demographicsSchema = z
  .object({
    age_group: z.string().min(1),
    gender: z.string().min(1),
    academic_background: z.string().min(1),
    current_residence: z.string().min(1),
    ATI: buildLikertSchema(ATI_KEYS),
    IUIPC: buildLikertSchema(IUIPC_KEYS),
  })
  .strict();

const draftDemographicsSchema = z
  .object({
    age_group: z.string().min(1).optional(),
    gender: z.string().min(1).optional(),
    academic_background: z.string().min(1).optional(),
    current_residence: z.string().min(1).optional(),
    ATI: z.record(z.string(), z.number().int().min(1).max(7)).optional(),
    IUIPC: z.record(z.string(), z.number().int().min(1).max(7)).optional(),
  })
  .strict();

const obfuscationEvaluationSchema = z
  .object({
    example_image_id: z.string().min(1),
    example_obfuscation_method: obfuscationMethodSchema,
    comfort_sharing: z.number().int().min(1).max(5),
    perceived_effectiveness: z.number().int().min(1).max(5),
    wants_automatic: z.boolean(),
  })
  .strict();

const stageSchema = z.enum([
  "welcome",
  "annotate_started",
  "annotate",
  "annotate_done",
  "obfuscation_started",
  "obfuscation_done",
  "demographics_done",
  "completed",
]);

const completePayloadSchema = z
  .object({
    session_id: z.string().min(1),
    context: z.string().min(1),
    statement_order: statementOrderSchema,
    started_at: z.string().min(1),
    completed_at: z.string().min(1),
    n_images: z.number().int().min(1),
    images: z.array(finalizedImageSchema).min(1),
    demographics: demographicsSchema,
    ATI: buildLikertSchema(ATI_KEYS),
    IUIPC: buildLikertSchema(IUIPC_KEYS),
    obfuscation_evaluation: obfuscationEvaluationSchema.nullable().optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const requiresObfuscationEvaluation = payload.images.some(
      (image) => image.statement1_regions.length > 0
    );
    if (requiresObfuscationEvaluation && !payload.obfuscation_evaluation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["obfuscation_evaluation"],
        message:
          "obfuscation_evaluation is required when any image has statement1_regions.",
      });
    }

    if (payload.images.length !== payload.n_images) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["images"],
        message: "images length must match n_images.",
      });
    }

    if (!isLikertMapEqual(payload.ATI, payload.demographics.ATI, ATI_KEYS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ATI"],
        message: "ATI must match demographics.ATI.",
      });
    }
    if (!isLikertMapEqual(payload.IUIPC, payload.demographics.IUIPC, IUIPC_KEYS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["IUIPC"],
        message: "IUIPC must match demographics.IUIPC.",
      });
    }
  });

const progressDraftSchema = z
  .object({
    images: z.array(draftImageSchema).optional(),
    obfuscation_evaluation: obfuscationEvaluationSchema.nullable().optional(),
    demographics: draftDemographicsSchema.optional(),
  })
  .strict();

const progressPayloadSchema = z
  .object({
    stage: stageSchema.optional(),
    draft: progressDraftSchema.optional(),
    images: z.array(draftImageSchema).optional(),
    obfuscation_evaluation: obfuscationEvaluationSchema.nullable().optional(),
    demographics: draftDemographicsSchema.optional(),
  })
  .passthrough();

module.exports = {
  completePayloadSchema,
  progressPayloadSchema,
};
