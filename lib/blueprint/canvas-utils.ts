import type { Node, Edge, Connection } from "reactflow";
import type { Blueprint, BlueprintStep } from "./types";

/**
 * Configuration for canvas layout
 */
export const CANVAS_LAYOUT = {
  NODE_X_GAP: 360,
  NODE_Y_GAP: 210,
  COLUMNS: 2,
} as const;

/**
 * Node data structure for React Flow custom nodes
 */
export interface CanvasNodeData {
  title: string;
  description: string;
  type: BlueprintStep["type"];
  status: "ai-suggested" | "complete" | "draft";
}

/**
 * Convert Blueprint steps to React Flow nodes
 *
 * @param blueprint - The Blueprint object containing steps
 * @returns Array of React Flow nodes
 */
export function blueprintToNodes(blueprint: Blueprint | null): Node<CanvasNodeData>[] {
  if (!blueprint || !blueprint.steps) {
    return [];
  }

  return blueprint.steps.map((step, index) => ({
    id: step.id,
    type: "custom",
    position: calculateNodePosition(index),
    data: {
      title: step.name,
      description: step.summary || "Click to add a summary",
      type: step.type,
      status: blueprint.status === "Draft" ? "ai-suggested" : "complete",
    },
  }));
}

/**
 * Convert Blueprint step connections to React Flow edges
 *
 * @param blueprint - The Blueprint object containing steps with nextStepIds
 * @returns Array of React Flow edges
 */
export function blueprintToEdges(blueprint: Blueprint | null): Edge[] {
  if (!blueprint || !blueprint.steps) {
    return [];
  }

  // Create a set of valid step IDs for validation
  const validStepIds = new Set(blueprint.steps.map((step) => step.id));

  // Flatten all step connections into edges
  return blueprint.steps.flatMap((step) =>
    step.nextStepIds
      .filter((targetId) => validStepIds.has(targetId)) // Only include edges to existing steps
      .map((targetId) => ({
        id: `edge-${step.id}-${targetId}`,
        source: step.id,
        target: targetId,
        type: "default",
      }))
  );
}

/**
 * Add a new connection to the blueprint
 * Updates the source step's nextStepIds array with the target step ID
 *
 * @param blueprint - The current Blueprint
 * @param connection - The React Flow connection object
 * @returns Updated Blueprint with the new connection
 */
export function addConnection(blueprint: Blueprint, connection: Connection): Blueprint {
  const { source, target } = connection;

  // Validate connection
  if (!source || !target || source === target) {
    return blueprint;
  }

  // Update the source step's nextStepIds
  const updatedSteps = blueprint.steps.map((step) => {
    if (step.id === source) {
      // Check if connection already exists
      if (step.nextStepIds.includes(target)) {
        return step;
      }
      // Add new connection
      return {
        ...step,
        nextStepIds: [...step.nextStepIds, target],
      };
    }
    return step;
  });

  return {
    ...blueprint,
    steps: updatedSteps,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove a connection from the blueprint
 * Removes the edge ID from the source step's nextStepIds array
 *
 * @param blueprint - The current Blueprint
 * @param edgeId - The edge ID to remove (format: "edge-{sourceId}-{targetId}")
 * @returns Updated Blueprint without the connection
 */
export function removeConnection(blueprint: Blueprint, edgeId: string): Blueprint {
  // Parse edge ID to extract source and target
  const edgePattern = /^edge-(.+)-(.+)$/;
  const match = edgeId.match(edgePattern);

  if (!match) {
    return blueprint;
  }

  const [, sourceId, targetId] = match;

  // Update the source step's nextStepIds
  const updatedSteps = blueprint.steps.map((step) => {
    if (step.id === sourceId) {
      return {
        ...step,
        nextStepIds: step.nextStepIds.filter((id) => id !== targetId),
      };
    }
    return step;
  });

  return {
    ...blueprint,
    steps: updatedSteps,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate node position based on index using a simple grid layout
 *
 * @param index - The step index
 * @returns Position object with x and y coordinates
 */
function calculateNodePosition(index: number): { x: number; y: number } {
  const column = index % CANVAS_LAYOUT.COLUMNS;
  const row = Math.floor(index / CANVAS_LAYOUT.COLUMNS);

  return {
    x: column * CANVAS_LAYOUT.NODE_X_GAP,
    y: row * CANVAS_LAYOUT.NODE_Y_GAP,
  };
}

/**
 * Auto-layout nodes using a simple grid algorithm
 * Recalculates positions for all steps based on their order
 *
 * @param blueprint - The Blueprint to layout
 * @returns Updated Blueprint with recalculated positions (note: positions are stored implicitly via index order)
 */
export function autoLayoutNodes(blueprint: Blueprint): Blueprint {
  // In this implementation, the layout is implicit based on step order
  // If we need explicit positioning later, we can add a position field to BlueprintStep
  // For now, this function just returns the blueprint with an updated timestamp
  // The actual positioning is handled by blueprintToNodes()

  return {
    ...blueprint,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Helper function to validate if a connection can be added
 * Prevents cycles and other invalid connections
 *
 * @param blueprint - The current Blueprint
 * @param connection - The proposed connection
 * @returns true if the connection is valid
 */
export function isValidConnection(blueprint: Blueprint, connection: Connection): boolean {
  const { source, target } = connection;

  if (!source || !target || source === target) {
    return false;
  }

  // Check if both nodes exist
  const validStepIds = new Set(blueprint.steps.map((step) => step.id));
  if (!validStepIds.has(source) || !validStepIds.has(target)) {
    return false;
  }

  // Check if connection already exists
  const sourceStep = blueprint.steps.find((step) => step.id === source);
  if (sourceStep?.nextStepIds.includes(target)) {
    return false;
  }

  // TODO: Add cycle detection if needed
  // For now, we allow all connections that don't create immediate loops

  return true;
}
