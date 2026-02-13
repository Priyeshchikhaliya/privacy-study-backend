const { z } = require("zod");

const bboxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .strict();

const APPROPRIATENESS_VALUES = [
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

const obfuscationMethodSchema = z.enum(["blackbox", "blur", "censor", "avatar"]);
const statementOrderSchema = z.union([z.literal(1), z.literal(2)]);
const obfuscationMethodsSchema = z.array(obfuscationMethodSchema);

const regionSchema = z
  .object({
    region_id: z.string().min(1),
    bbox: bboxSchema,
    appropriateness_rating: z.enum(APPROPRIATENESS_VALUES),
    information_types: z.array(z.string().min(1)).min(1),
  })
  .strict();

const draftRegionSchema = z
  .object({
    region_id: z.string().min(1),
    bbox: bboxSchema,
    appropriateness_rating: z
      .enum(APPROPRIATENESS_VALUES)
      .nullable()
      .optional(),
    information_types: z.array(z.string().min(1)).optional().default([]),
  })
  .strict();

const finalizedImageSchema = z
  .object({
    image_id: z.string().min(1),
    overall_sensitivity: z.number().int().min(1).max(4),
    statement1_regions: z.array(regionSchema),
    statement2_regions: z.array(regionSchema),
    obfuscation_methods: obfuscationMethodsSchema.optional(),
    obfuscation_method: obfuscationMethodSchema.nullable().optional(),
  })
  .strict()
  .superRefine((image, ctx) => {
    if (image.statement1_regions.length === 0) return;
    const methods = Array.isArray(image.obfuscation_methods)
      ? image.obfuscation_methods
      : image.obfuscation_method
        ? [image.obfuscation_method]
        : [];
    if (methods.length > 0) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["obfuscation_methods"],
      message:
        "At least one obfuscation method is required when statement1_regions has at least one region.",
    });
  });

const draftImageSchema = z
  .object({
    image_id: z.string().min(1),
    overall_sensitivity: z.number().int().min(1).max(4).nullable().optional(),
    statement1_regions: z.array(draftRegionSchema).default([]),
    statement2_regions: z.array(draftRegionSchema).default([]),
    obfuscation_methods: z.array(obfuscationMethodSchema).optional(),
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
