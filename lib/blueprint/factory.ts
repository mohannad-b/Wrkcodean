import type { Blueprint } from "./types";

export function createEmptyBlueprint(): Blueprint {
  const timestamp = new Date().toISOString();
  return {
    version: 1,
    status: "Draft",
    goals: [],
    phases: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

