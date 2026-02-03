const { z } = require("zod");

const bboxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

const reasonDetailSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1).optional(),
});

const legacyRegionSchema = z.object({
  region_id: z.string().min(1),
  bbox: bboxSchema,
  region_privacy_rating: z.number().int().min(1).max(4), // you used 1–4 in UI discussions
  region_type: z.string().min(1),
  region_type_other: z.string().nullable().optional(),
  reason_other: z.string().nullable().optional(),
  reason_category: z.string().min(1),
});

const updatedRegionSchema = z.object({
  region_id: z.string().min(1),
  bbox: bboxSchema,
  region_privacy_rating: z.number().int().min(1).max(4), // you used 1–4 in UI discussions
  regionType: z.string().min(1),
  regionTypeOtherText: z.string().nullable().optional(),
  reasons: z.array(z.string().min(1)).min(1),
  reasonDetails: z.array(reasonDetailSchema).optional(),
  otherReasonText: z.string().nullable().optional(),
});

const regionSchema = z.union([legacyRegionSchema, updatedRegionSchema]);

const imageSchema = z.object({
  image_id: z.string().min(1),
  image_rating: z.number().int().min(1).max(4), // image-level 1–4
  no_sensitive: z.boolean(),
  regions: z.array(regionSchema),
});

const demographicsSchema = z.object({
  age_group: z.string().min(1),
  gender: z.string().min(1),
  academic_background: z.string().min(1),
  current_residence: z.string().min(1),
  ATI: z.record(z.string(), z.number().int().min(1).max(7)).optional(),
  IUIPC: z.record(z.string(), z.number().int().min(1).max(7)).optional(),
});

const obfuscationSchema = z.object({
  imageId: z.string().min(1).nullable(),
  imageUrl: z.string().min(1).nullable().optional(),
  obfuscationType: z.string().min(1),
  methodsSelected: z.array(z.string()).default([]),
  basedOnRegions: z.boolean(),
  numRegionsUsed: z.number().int().min(0),
  comfortSharing: z.number().int().min(1).max(5),
  perceivedEffectiveness: z.number().int().min(1).max(5),
  wantsObfuscation: z.boolean(),
  comment: z.string().optional().nullable(),
  timestamp: z.string().min(1).optional(),
  skippedBecauseNoRegions: z.boolean().optional(),
  skipped: z.boolean().optional(),
  reason: z.string().optional(),
});

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

const completePayloadSchema = z.object({
  session_id: z.string().min(1),
  started_at: z.string().min(1).optional(),
  completed_at: z.string().min(1).optional(),
  context: z.string().min(1).optional(),
  images: z.array(imageSchema).min(1),
  demographics: demographicsSchema,
  obfuscation_response: obfuscationSchema,
});

const progressPayloadSchema = z
  .object({
    stage: stageSchema.optional(),
    draft: z.record(z.string(), z.any()).optional(),
  })
  .passthrough();

module.exports = {
  completePayloadSchema,
  progressPayloadSchema,
};
