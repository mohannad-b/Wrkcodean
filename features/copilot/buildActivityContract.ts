import { z } from "zod";

export const BuildStageEnum = z.enum([
  "readiness",
  "requirements",
  "tasks",
  "workflow_build",
  "validation",
  "done",
  "error",
]);

export type BuildStage = z.infer<typeof BuildStageEnum>;

export const BuildStatusEnum = z.enum(["queued", "running", "waiting_user", "done", "error", "blocked"]);

export type BuildStatus = z.infer<typeof BuildStatusEnum>;

export const BuildActivityCtaSchema = z.object({
  label: z.string().min(1),
  destination: z.string().min(1),
});

export type BuildActivityCta = z.infer<typeof BuildActivityCtaSchema>;

export const BuildActivityEventSchema = z.object({
  runId: z.string().min(1),
  stage: BuildStageEnum,
  status: BuildStatusEnum,
  title: z.string().min(1),
  detail: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
  cta: BuildActivityCtaSchema.optional(),
});

export type BuildActivityEvent = z.infer<typeof BuildActivityEventSchema>;

export const BuildActivitySnapshotSchema = z.object({
  runId: z.string().min(1),
  stage: BuildStageEnum,
  status: BuildStatusEnum,
  title: z.string().min(1),
  detail: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
  cta: BuildActivityCtaSchema.optional(),
  events: z.array(BuildActivityEventSchema),
});

export type BuildActivitySnapshot = z.infer<typeof BuildActivitySnapshotSchema>;
