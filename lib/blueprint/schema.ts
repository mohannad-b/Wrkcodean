import { z } from "zod";
import type { Blueprint } from "./types";
import { BLUEPRINT_SECTION_KEYS } from "./types";

const isoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid timestamp" });

export const BlueprintStatusSchema = z.enum(["Draft", "ReadyForQuote", "ReadyToBuild"]);

export const BlueprintStepTypeSchema = z.enum(["Trigger", "Action", "Logic", "Human"]);

export const BlueprintResponsibilitySchema = z.enum(["Automated", "HumanReview", "Approval"]);

export const BlueprintRiskLevelSchema = z.enum(["Low", "Medium", "High"]);

export const BlueprintSectionKeySchema = z.enum(BLUEPRINT_SECTION_KEYS);

export const BlueprintSectionSchema = z.object({
  id: z.string().min(1),
  key: BlueprintSectionKeySchema,
  title: z.string().min(1).max(120),
  content: z.string().max(20000),
});

export const BlueprintStepSchema = z.object({
  id: z.string().min(1),
  type: BlueprintStepTypeSchema,
  name: z.string().min(1).max(200),
  summary: z.string().min(1).max(4000),
  goalOutcome: z.string().min(1).max(2000),
  responsibility: BlueprintResponsibilitySchema,
  notesExceptions: z.string().max(4000).optional(),
  systemsInvolved: z.array(z.string().min(1).max(120)).max(20),
  timingSla: z.string().min(1).max(120).optional(),
  riskLevel: BlueprintRiskLevelSchema.optional(),
  notifications: z.array(z.string().min(1).max(120)).max(20),
  notesForOps: z.string().max(4000).optional(),
  exceptionIds: z.array(z.string().min(1)).max(20).optional(),
  nextStepIds: z.array(z.string().min(1)).max(20),
});

export const BlueprintSchema = z
  .object({
    version: z.literal(1),
    status: BlueprintStatusSchema,
    summary: z.string().max(4000),
    sections: z.array(BlueprintSectionSchema),
    steps: z.array(BlueprintStepSchema),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .superRefine((value, ctx) => {
    const sectionKeys = value.sections.map((section) => section.key);
    const missing = BLUEPRINT_SECTION_KEYS.filter((key) => !sectionKeys.includes(key));
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Missing sections for keys: ${missing.join(", ")}`,
        path: ["sections"],
      });
    }
    const duplicates = sectionKeys.filter((key, index) => sectionKeys.indexOf(key) !== index);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate sections for keys: ${Array.from(new Set(duplicates)).join(", ")}`,
        path: ["sections"],
      });
    }
  });

export type BlueprintInput = z.infer<typeof BlueprintSchema>;

export function parseBlueprint(value: unknown): Blueprint | null {
  if (!value) {
    return null;
  }
  const result = BlueprintSchema.safeParse(value);
  return result.success ? result.data : null;
}

