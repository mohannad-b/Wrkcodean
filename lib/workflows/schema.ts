import { z } from "zod";
import type { WorkflowSpec } from "./types";
import { WORKFLOW_SECTION_KEYS } from "./types";

const isoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid timestamp" });

export const WorkflowStatusSchema = z.enum(["Draft", "ReadyForQuote", "ReadyToBuild"]);

export const WorkflowStepTypeSchema = z.enum(["Trigger", "Action", "Decision", "Exception", "Human"]);

export const WorkflowResponsibilitySchema = z.enum(["Automated", "HumanReview", "Approval"]);

export const WorkflowRiskLevelSchema = z.enum(["Low", "Medium", "High"]);

export const WorkflowSectionKeySchema = z.enum(WORKFLOW_SECTION_KEYS);

export const WorkflowSectionSchema = z.object({
  id: z.string().min(1),
  key: WorkflowSectionKeySchema,
  title: z.string().min(1).max(120),
  content: z.string().max(20000),
});

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  type: WorkflowStepTypeSchema,
  name: z.string().min(1).max(200),
  summary: z.string().min(1).max(4000),
  description: z
    .string()
    .min(0)
    .max(4000)
    .default(""),
  goalOutcome: z.string().min(1).max(2000),
  responsibility: WorkflowResponsibilitySchema,
  notesExceptions: z.string().max(4000).optional(),
  systemsInvolved: z.array(z.string().min(1).max(120)).max(20),
  timingSla: z.string().min(1).max(120).optional(),
  riskLevel: WorkflowRiskLevelSchema.optional(),
  notifications: z.array(z.string().min(1).max(120)).max(20),
  notesForOps: z.string().max(4000).optional(),
  exceptionIds: z.array(z.string().min(1)).max(20).optional(),
  nextStepIds: z.array(z.string().min(1)).max(20),
  stepNumber: z
    .string()
    .max(16)
    .default(""),
  branchType: z.enum(["conditional", "exception", "parallel"]).optional(),
  branchCondition: z.string().max(2000).optional(),
  branchLabel: z.string().max(120).optional(),
  parentStepId: z.string().min(1).optional(),
  taskIds: z.array(z.string().min(1)).max(100).default([]),
});

export const WorkflowBranchSchema = z.object({
  id: z.string().min(1),
  parentStepId: z.string().min(1),
  condition: z.string().min(1).max(4000),
  label: z.string().min(1).max(120),
  targetStepId: z.string().min(1),
});

export const WorkflowSchema = z
  .object({
    version: z.literal(1),
    status: WorkflowStatusSchema,
    summary: z.string().max(4000),
    sections: z.array(WorkflowSectionSchema),
    steps: z.array(WorkflowStepSchema),
    branches: z.array(WorkflowBranchSchema).default([]),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .superRefine((value, ctx) => {
    const sectionKeys = value.sections.map((section) => section.key);
    const missing = WORKFLOW_SECTION_KEYS.filter((key) => !sectionKeys.includes(key));
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

export type WorkflowInput = z.infer<typeof WorkflowSchema>;
export type BlueprintInput = WorkflowInput;
export const BlueprintStatusSchema = WorkflowStatusSchema;
export const BlueprintStepTypeSchema = WorkflowStepTypeSchema;
export const BlueprintResponsibilitySchema = WorkflowResponsibilitySchema;
export const BlueprintRiskLevelSchema = WorkflowRiskLevelSchema;
export const BlueprintSectionKeySchema = WorkflowSectionKeySchema;
export const BlueprintSectionSchema = WorkflowSectionSchema;
export const BlueprintStepSchema = WorkflowStepSchema;
export const BlueprintBranchSchema = WorkflowBranchSchema;
export const BlueprintSchema = WorkflowSchema;

export function parseWorkflowSpec(value: unknown): WorkflowSpec | null {
  if (!value) {
    return null;
  }
  const result = WorkflowSchema.safeParse(value);
  return result.success ? result.data : null;
}

// Legacy alias
export const parseBlueprint = parseWorkflowSpec;

