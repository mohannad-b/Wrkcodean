import type { Node, Edge, Connection } from "reactflow";
import type { Blueprint, BlueprintStep } from "./types";

/**
 * Configuration for canvas layout
 */
export const CANVAS_LAYOUT = {
  NODE_X_GAP: 360,
  NODE_Y_GAP: 220,
} as const;

/**
 * Node data structure for React Flow custom nodes
 */
export interface CanvasNodeData {
  title: string;
  description: string;
  type: BlueprintStep["type"];
  status: "ai-suggested" | "complete" | "draft";
  isNew?: boolean;
  isUpdated?: boolean;
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

  const positions = computeLayoutPositions(blueprint.steps);

  return blueprint.steps.map((step, index) => {
    const position =
      positions.get(step.id) ?? { x: 0, y: index * CANVAS_LAYOUT.NODE_Y_GAP };

    return {
      id: step.id,
      type: "custom",
      position,
      data: {
        title: step.name,
        description: step.summary || "Click to add a summary",
        type: step.type,
        status: blueprint.status === "Draft" ? "ai-suggested" : "complete",
      },
    };
  });
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
function computeLayoutPositions(steps: BlueprintStep[]): Map<string, { x: number; y: number }> {
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const step of steps) {
    adjacency.set(step.id, new Set(step.nextStepIds));
    indegree.set(step.id, 0);
  }

  for (const step of steps) {
    for (const target of step.nextStepIds) {
      if (indegree.has(target)) {
        indegree.set(target, (indegree.get(target) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  const levels = new Map<string, number>();

  indegree.forEach((count, id) => {
    if (count === 0) {
      queue.push(id);
      levels.set(id, 0);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const level = levels.get(current) ?? 0;
    const targets = adjacency.get(current);
    if (!targets) {
      continue;
    }
    for (const target of targets) {
      const nextLevel = Math.max(level + 1, levels.get(target) ?? 0);
      levels.set(target, nextLevel);
      const currentIndegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, currentIndegree);
      if (currentIndegree <= 0) {
        queue.push(target);
      }
    }
  }

  const levelGroups = new Map<number, string[]>();
  for (const step of steps) {
    const level = levels.get(step.id) ?? 0;
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)?.push(step.id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  levelGroups.forEach((ids, level) => {
    const width = ids.length;
    const offset = (width - 1) / 2;
    ids.forEach((id, index) => {
      const x = (index - offset) * CANVAS_LAYOUT.NODE_X_GAP;
      const y = level * CANVAS_LAYOUT.NODE_Y_GAP;
      positions.set(id, { x, y });
    });
  });

  return positions;
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
