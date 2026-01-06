import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger";
import { buildStepSignature, summarizeStepDiff, type StepLike } from "./trace-helpers";

const DEBUG_FLAG = (process.env.DEBUG_LOG ?? "").toLowerCase();
export const debugLogEnabled =
  DEBUG_FLAG === "1" || DEBUG_FLAG === "true" || (process.env.NODE_ENV !== "production" && DEBUG_FLAG !== "0");

const LOG_PATH = process.env.DEBUG_LOG_PATH ?? path.join(process.cwd(), "debug.log");

async function appendLine(entry: Record<string, unknown>) {
  const line = JSON.stringify(entry);
  if (!debugLogEnabled) {
    const clipped = line.length > 2000 ? `${line.slice(0, 2000)}…` : line;
    logger.debug(clipped);
    return;
  }

  try {
    await fs.promises.appendFile(LOG_PATH, `${line}\n`, { encoding: "utf8" });
  } catch (error) {
    logger.error("[trace] Failed to append debug log", error);
  }
}

type TraceOptions = {
  steps?: StepLike[];
};

export function createTraceLogger(runIdInput?: string) {
  const traceId = runIdInput ?? randomUUID();
  const runId = traceId;
  let lastSignature = buildStepSignature([]);

  const log = async (stage: string, event: string, data?: Record<string, unknown>, options?: TraceOptions) => {
    const signature = options?.steps ? buildStepSignature(options.steps) : lastSignature;
    const diff =
      options?.steps && signature.stepsSig !== lastSignature.stepsSig
        ? summarizeStepDiff(lastSignature.stepNames, signature.stepNames)
        : undefined;

    if (options?.steps) {
      lastSignature = signature;
    }

    await appendLine({
      ts: new Date().toISOString(),
      stage,
      event,
      runId,
      traceId,
      data: {
        ...(data ?? {}),
        stepCount: signature.stepCount,
        stepsSig: signature.stepsSig,
        ...(diff ? { stepDiff: diff } : {}),
      },
    });
  };

  return {
    runId,
    traceId,
    log,
    setSteps(steps: StepLike[]) {
      lastSignature = buildStepSignature(steps);
    },
  };
}

export async function writeClientDebugLog(payload: {
  stage: string;
  event: string;
  data?: Record<string, unknown>;
  runId?: string;
  traceId?: string;
  ts?: string;
}) {
  const ts = payload.ts ?? new Date().toISOString();
  const runId = payload.runId ?? payload.traceId ?? randomUUID();
  const traceId = payload.traceId ?? runId;
  await appendLine({
    ts,
    stage: payload.stage,
    event: payload.event,
    runId,
    traceId,
    data: payload.data ?? {},
    source: "client",
  });
}

