const { z } = require("zod");

const bboxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .strict();

const APPROPRIATENESS_NOT_SHARE_VALUES = [
  "slightly_inappropriate",
  "moderately_inappropriate",
  "very_inappropriate",
  "completely_inappropriate",
  "difficult_to_say",
];

const APPROPRIATENESS_TO_SHARE_VALUES = [
  "slightly_appropriate",
  "moderately_appropriate",
  "very_appropriate",
  "completely_appropriate",
  "difficult_to_say",
];

const INFORMATION_TYPE_VALUES = [
  "pii",
  "location",
  "personal_interests",
  "social_context",
  "private_spaces",
  "others_private_info",
  "others",
  "none",
];

const EXCLUSIVE_INFORMATION_TYPES = new Set(["none"]);

const obfuscationMethodSchema = z.enum(["blackbox", "blur", "censor", "avatar"]);
const statementOrderSchema = z.union([z.literal(1), z.literal(2)]);
const appropriatenessNotShareSchema = z.enum(APPROPRIATENESS_NOT_SHARE_VALUES);
const appropriatenessToShareSchema = z.enum(APPROPRIATENESS_TO_SHARE_VALUES);
const informationTypeSchema = z.enum(INFORMATION_TYPE_VALUES);

const validateInformationTypeSelection = (region, ctx) => {
  const informationTypes = Array.isArray(region?.information_types)
    ? region.information_types
    : [];
  if (informationTypes.length <= 1) return;
  const selectedExclusiveTypes = informationTypes.filter((type) =>
    EXCLUSIVE_INFORMATION_TYPES.has(type)
  );
  if (selectedExclusiveTypes.length === 0) return;

  if (informationTypes.includes("none")) {
    ctx.addIssue({
      code: "custom",
      path: ["information_types"],
      message: "'none' cannot be combined with other information types.",
    });
  }
};

const statement1RegionSchema = z
  .object({
    region_id: z.string().min(1),
    bbox: bboxSchema,
    appropriateness_not_share: appropriatenessNotShareSchema,
    information_types: z.array(informationTypeSchema).min(1),
    other_information: z.string().optional(),
  })
  .strict()
  .superRefine(validateInformationTypeSelection);

const statement2RegionSchema = z
  .object({
    region_id: z.string().min(1),
    bbox: bboxSchema,
    appropriateness_to_share: appropriatenessToShareSchema,
    information_types: z.array(informationTypeSchema).min(1),
    other_information: z.string().optional(),
  })
  .strict()
  .superRefine(validateInformationTypeSelection);

const draftStatement1RegionSchema = z
  .object({
    region_id: z.string().min(1),
    bbox: bboxSchema,
    appropriateness_not_share: appropriatenessNotShareSchema.nullable().optional(),
    information_types: z.array(informationTypeSchema).optional().default([]),
    other_information: z.string().optional(),
  })
  .strict()
  .superRefine(validateInformationTypeSelection);

const draftStatement2RegionSchema = z
  .object({
    region_id: z.string().min(1),
    bbox: bboxSchema,
    appropriateness_to_share: appropriatenessToShareSchema.nullable().optional(),
    information_types: z.array(informationTypeSchema).optional().default([]),
    other_information: z.string().optional(),
  })
  .strict()
  .superRefine(validateInformationTypeSelection);

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
      code: "custom",
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
        code: "custom",
        path: ["obfuscation_evaluation"],
        message:
          "obfuscation_evaluation is required when any image has statement1_regions.",
      });
    }

    if (payload.images.length !== payload.n_images) {
      ctx.addIssue({
        code: "custom",
        path: ["images"],
        message: "images length must match n_images.",
      });
    }

    if (!isLikertMapEqual(payload.ATI, payload.demographics.ATI, ATI_KEYS)) {
      ctx.addIssue({
        code: "custom",
        path: ["ATI"],
        message: "ATI must match demographics.ATI.",
      });
    }
    if (!isLikertMapEqual(payload.IUIPC, payload.demographics.IUIPC, IUIPC_KEYS)) {
      ctx.addIssue({
        code: "custom",
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
  .strict();

module.exports = {
  completePayloadSchema,
  progressPayloadSchema,
};
