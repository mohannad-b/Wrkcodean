import type { BuildActivityCta, BuildStage, BuildStatus } from "@/features/copilot/buildActivityContract";
import { emitBuildActivity } from "@/lib/build-activity/emitter";

type StageState = {
  started: boolean;
  done: boolean;
  updates: number;
};

type RunState = {
  totalEvents: number;
  stages: Map<BuildStage, StageState>;
};

const MAX_EVENTS_PER_RUN = 14;
const MAX_STAGE_UPDATES = 1;

const runState = new Map<string, RunState>();

function getStageState(runId: string, stage: BuildStage): StageState {
  let state = runState.get(runId);
  if (!state) {
    state = { totalEvents: 0, stages: new Map() };
    runState.set(runId, state);
  }
  const stageState = state.stages.get(stage) ?? { started: false, done: false, updates: 0 };
  state.stages.set(stage, stageState);
  return stageState;
}

function canEmit(runId: string, stage: BuildStage, status: BuildStatus): boolean {
  const state = runState.get(runId);
  if (!state) return true;
  if (status === "error" || stage === "error" || stage === "done") return true;
  return state.totalEvents < MAX_EVENTS_PER_RUN;
}

function trackEmission(runId: string, stage: BuildStage, status: BuildStatus) {
  const state = runState.get(runId);
  if (!state) return;
  state.totalEvents += 1;
  if (status === "done" || stage === "done" || status === "error" || stage === "error") {
    const stageState = getStageState(runId, stage);
    stageState.done = true;
  }
}

type EmitInput = {
  automationVersionId: string;
  runId: string;
  stage: BuildStage;
  status: BuildStatus;
  title: string;
  detail?: string;
  progress?: number;
  cta?: BuildActivityCta;
};

function emitNormalized(input: EmitInput) {
  if (!canEmit(input.runId, input.stage, input.status)) return;
  emitBuildActivity(input);
  trackEmission(input.runId, input.stage, input.status);
}

export function createBuildActivityEmitter(params: { automationVersionId: string; runId: string }) {
  const { automationVersionId, runId } = params;

  const startStage = (input: Omit<EmitInput, "automationVersionId" | "runId" | "status">) => {
    const stageState = getStageState(runId, input.stage);
    if (stageState.started || stageState.done) return;
    stageState.started = true;
    emitNormalized({ automationVersionId, runId, status: "running", ...input });
  };

  const updateStage = (input: Omit<EmitInput, "automationVersionId" | "runId">) => {
    const stageState = getStageState(runId, input.stage);
    if (stageState.done) return;
    if (!stageState.started) {
      stageState.started = true;
      emitNormalized({ automationVersionId, runId, status: "running", ...input });
      return;
    }
    if (stageState.updates >= MAX_STAGE_UPDATES) return;
    stageState.updates += 1;
    emitNormalized({ automationVersionId, runId, ...input });
  };

  const doneStage = (input: Omit<EmitInput, "automationVersionId" | "runId" | "status">) => {
    const stageState = getStageState(runId, input.stage);
    if (!stageState.started) {
      stageState.started = true;
      emitNormalized({ automationVersionId, runId, status: "running", ...input });
    }
    if (stageState.done) return;
    stageState.done = true;
    emitNormalized({ automationVersionId, runId, status: "done", ...input });
  };

  const errorStage = (input: Omit<EmitInput, "automationVersionId" | "runId" | "status" | "stage">) => {
    emitNormalized({
      automationVersionId,
      runId,
      stage: "error",
      status: "error",
      ...input,
    });
  };

  const finalStage = (input: Omit<EmitInput, "automationVersionId" | "runId" | "status">) => {
    const stageState = getStageState(runId, input.stage);
    if (stageState.done) return;
    stageState.started = true;
    stageState.done = true;
    emitNormalized({ automationVersionId, runId, status: "done", ...input });
  };

  return { startStage, updateStage, doneStage, errorStage, finalStage };
}
