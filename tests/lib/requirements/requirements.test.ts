import { describe, expect, it } from "vitest";
import type { RequirementDefinition } from "@/lib/requirements/schema";
import {
  initialRequirementsState,
  markAnswered,
  markSkipped,
  markAsked,
  computeCompletion,
  RequirementStatus,
} from "@/lib/requirements/state";
import { bundleMissingRequirements, pickNextRequirementDefinitions } from "@/lib/requirements/planner";
import { vi } from "vitest";

const SAMPLE_DEFINITIONS: RequirementDefinition[] = [
  {
    id: "req-business",
    label: "Business context",
    prompt: "What problem are we solving?",
    tags: ["business_context"],
    weight: 0.6,
  },
  {
    id: "req-systems",
    label: "Systems",
    prompt: "Which systems are involved?",
    tags: ["systems"],
    weight: 0.3,
    dependsOn: ["req-business"],
  },
  {
    id: "req-security",
    label: "Security",
    prompt: "Any security constraints?",
    tags: ["security"],
    weight: 0.1,
  },
];

const TIMESTAMP = "2025-01-01T00:00:00.000Z";

describe("requirements state completion", () => {
  it("returns 0 when nothing has been answered or skipped", () => {
    const state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    expect(computeCompletion(state, SAMPLE_DEFINITIONS)).toBe(0);
  });

  it("returns 1 when every requirement is answered", () => {
    let state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    for (const definition of SAMPLE_DEFINITIONS) {
      state = markAnswered(state, definition.id, "done", TIMESTAMP);
    }
    expect(computeCompletion(state, SAMPLE_DEFINITIONS)).toBe(1);
  });

  it("returns the ratio of answered/Skipped weights", () => {
    let state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    state = markAnswered(state, "req-business", "solved", TIMESTAMP);
    state = markSkipped(state, "req-systems", TIMESTAMP);
    const completion = computeCompletion(state, SAMPLE_DEFINITIONS);
    expect(completion).toBeCloseTo((0.6 + 0.3) / 1, 5);
  });
});

describe("pickNextRequirementDefinitions", () => {
  it("does not return answered or skipped requirements", () => {
    let state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    state = markAnswered(state, "req-business", "done", TIMESTAMP);
    state = markSkipped(state, "req-security", TIMESTAMP);
    const next = pickNextRequirementDefinitions(state, SAMPLE_DEFINITIONS, 5);
    expect(next.map((def) => def.id)).toEqual(["req-systems"]);
  });

  it("respects dependency ordering", () => {
    const state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    const next = pickNextRequirementDefinitions(state, SAMPLE_DEFINITIONS, 5);
    expect(next.map((def) => def.id)).toEqual(["req-business", "req-security"]);
  });

  it("unlocks dependent requirements once parents are satisfied", () => {
    let state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    state = markAnswered(state, "req-business", "done", TIMESTAMP);
    const next = pickNextRequirementDefinitions(state, SAMPLE_DEFINITIONS, 5);
    expect(next.map((def) => def.id)).toEqual(["req-systems", "req-security"]);
  });

  it("prefers higher-weight fresh requirements over lower-weight asked ones", () => {
    let state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    state = markAnswered(state, "req-business", "done", TIMESTAMP);
    state = markAsked(state, "req-security", TIMESTAMP);
    const next = pickNextRequirementDefinitions(state, SAMPLE_DEFINITIONS, 5);
    expect(next[0]?.id).toBe("req-systems");
    expect(next[1]?.id).toBe("req-security");
    expect(state.items["req-security"]?.status).toBe(RequirementStatus.Asked);
  });

  it("excludes recently asked requirements", () => {
    vi.setSystemTime(new Date("2025-01-01T00:10:00.000Z"));
    let state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    state = markAsked(state, "req-business", "done", "2025-01-01T00:09:30.000Z");
    const next = pickNextRequirementDefinitions(state, SAMPLE_DEFINITIONS, 5);
    expect(next.some((def) => def.id === "req-business")).toBe(false);
    vi.useRealTimers();
  });
});

describe("bundleMissingRequirements", () => {
  it("returns null when no requirements remain", () => {
    let state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    for (const def of SAMPLE_DEFINITIONS) {
      state = markAnswered(state, def.id, "done", TIMESTAMP);
    }
    const bundle = bundleMissingRequirements(state, SAMPLE_DEFINITIONS, 3);
    expect(bundle).toBeNull();
  });

  it("bundles the highest priority missing items into one question", () => {
    const state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    const bundle = bundleMissingRequirements(state, SAMPLE_DEFINITIONS, 3);
    expect(bundle).not.toBeNull();
    expect(bundle?.bundledRequirementIds).toEqual(["req-business", "req-security"]);
    expect(bundle?.bundledQuestion).toMatch(/quick sense of business context and security/i);
    expect(bundle?.steps).toEqual(["Business context", "Security"]);
  });

  it("creates a concise single requirement question when only one item is missing", () => {
    let state = initialRequirementsState("bp-1", SAMPLE_DEFINITIONS);
    state = markAnswered(state, "req-business", "done", TIMESTAMP);
    state = markAnswered(state, "req-security", "done", TIMESTAMP);
    const bundle = bundleMissingRequirements(state, SAMPLE_DEFINITIONS, 3);
    expect(bundle?.bundledRequirementIds).toEqual(["req-systems"]);
    expect(bundle?.bundledQuestion).toMatch(/tell me about systems/i);
  });
});


