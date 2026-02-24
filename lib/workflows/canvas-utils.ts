import type { Node, Edge, Connection } from "reactflow";
import type { WorkflowSpec, WorkflowStep } from "./types";
import { generateStepNumbers } from "./step-numbering";

/** Max entries in layout cache to avoid unbounded memory growth */
const LAYOUT_CACHE_MAX_SIZE = 100;

/** Above this step count, layout can be deferred to requestIdleCallback (browser) */
export const LARGE_GRAPH_LAYOUT_THRESHOLD = 15;

/** Cache key -> computed positions. Skipped when workflow structure unchanged. */
const layoutCache = new Map<string, Map<string, { x: number; y: number }>>();

/**
 * Create a stable hash of step graph structure for layout cache key.
 * Same structure => same hash => skip recomputation.
 */
function layoutCacheKey(steps: WorkflowStep[]): string {
  const parts = steps.map(
    (s) => `${s.id}:${s.parentStepId ?? ""}:${[...(s.nextStepIds ?? [])].sort().join(",")}`
  );
  return parts.join("|");
}

/**
 * Configuration for canvas layout
 */
export const CANVAS_LAYOUT = {
  NODE_X_GAP: 500,
  NODE_Y_GAP: 280,
  BRANCH_X_GAP: 560, // Increased spacing for branches to prevent overlap
  MIN_BRANCH_SPACING: 520, // Minimum spacing between branch nodes
} as const;

/**
 * Node data structure for React Flow custom nodes
 */
export interface CanvasNodeData {
  title: string;
  description: string;
  type: WorkflowStep["type"];
  status: "ai-suggested" | "complete" | "draft";
  isNew?: boolean;
  isUpdated?: boolean;
  stepNumber?: string;
  displayId?: string;
  displayLabel?: string;
  branchCondition?: string;
  pendingTaskCount?: number;
  totalTaskCount?: number;
}

/**
 * Quick O(n) layout for large graphs. Used as initial render while full layout runs in requestIdleCallback.
 */
function computeLayoutPositionsQuick(steps: WorkflowStep[]): Map<string, { x: number; y: number }> {
  const levels = new Map<string, number>();
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const indegree = new Map<string, number>();
  steps.forEach((s) => indegree.set(s.id, 0));
  steps.forEach((s) => {
    s.nextStepIds.forEach((t) => {
      if (indegree.has(t)) indegree.set(t, (indegree.get(t) ?? 0) + 1);
    });
  });
  const queue = steps.filter((s) => indegree.get(s.id) === 0).map((s) => s.id);
  let idx = 0;
  while (idx < queue.length) {
    const id = queue[idx++];
    const level = levels.get(id) ?? 0;
    const step = stepById.get(id);
    step?.nextStepIds.forEach((t) => {
      levels.set(t, Math.max(levels.get(t) ?? 0, level + 1));
      const d = (indegree.get(t) ?? 1) - 1;
      indegree.set(t, d);
      if (d <= 0) queue.push(t);
    });
  }
  steps.forEach((s) => {
    if (!levels.has(s.id)) levels.set(s.id, levels.size);
  });
  const byLevel = new Map<number, string[]>();
  levels.forEach((l, id) => {
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(id);
  });
  const positions = new Map<string, { x: number; y: number }>();
  Array.from(byLevel.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([level, ids]) => {
      const y = level * CANVAS_LAYOUT.NODE_Y_GAP;
      ids.forEach((id, i) => {
        const x = (i - (ids.length - 1) / 2) * CANVAS_LAYOUT.NODE_X_GAP;
        positions.set(id, { x, y });
      });
    });
  return positions;
}

/**
 * Schedule layout computation during browser idle time. Use for large graphs (>15 steps) to avoid blocking the main thread.
 * Falls back to immediate execution if requestIdleCallback is unavailable (e.g. SSR).
 */
export function scheduleLayoutInIdle(
  steps: WorkflowStep[]
): Promise<Map<string, { x: number; y: number }>> {
  return new Promise((resolve) => {
    const run = () => {
      const result = computeLayoutPositions(steps);
      resolve(result);
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(run, { timeout: 100 });
    } else {
      run();
    }
  });
}

/**
 * Convert WorkflowSpec steps to React Flow nodes
 *
 * @param workflow - The WorkflowSpec object containing steps
 * @param taskLookup - Optional map of task statuses
 * @param positionsOverride - Optional precomputed positions (e.g. from scheduleLayoutInIdle for large graphs)
 * @returns Array of React Flow nodes
 */
export function workflowToNodes(
  workflow: WorkflowSpec | null,
  taskLookup?: Map<string, { status?: string | null }>,
  positionsOverride?: Map<string, { x: number; y: number }> | null
): Node<CanvasNodeData>[] {
  if (!workflow || !workflow.steps) {
    return [];
  }

  // Generate step numbers for all steps
  const numbering = generateStepNumbers(workflow);

  // Calculate positions - use override, stored, or compute layout
  // For large graphs (>15 steps) without override, use quick layout first; caller can pass positionsOverride from scheduleLayoutInIdle for full layout
  const storedPositions = workflow.metadata?.nodePositions;
  const stepCount = workflow.steps.length;
  const useQuickLayout =
    stepCount > LARGE_GRAPH_LAYOUT_THRESHOLD && !positionsOverride && !storedPositions;
  const computedPositions =
    positionsOverride ??
    (useQuickLayout ? computeLayoutPositionsQuick(workflow.steps) : computeLayoutPositions(workflow.steps));

  // Merge stored positions with computed positions (stored takes precedence)
  const positions = new Map<string, { x: number; y: number }>();
  computedPositions.forEach((pos, id) => {
    positions.set(id, pos);
  });
  if (storedPositions) {
    Object.entries(storedPositions).forEach(([id, pos]) => {
      positions.set(id, pos);
    });
  }

  return workflow.steps.map((step, index) => {
    const position = positions.get(step.id) ?? { x: 0, y: index * CANVAS_LAYOUT.NODE_Y_GAP };

    // Get numbering info for this step
    const stepNumbering = numbering.get(step.id);

    let totalTaskCount = step.taskIds?.length ?? 0;
    let pendingTaskCount = totalTaskCount;
    if (taskLookup && Array.isArray(step.taskIds) && step.taskIds.length > 0) {
      let resolvedTotal = 0;
      let pending = 0;
      step.taskIds.forEach((taskId) => {
        const task = taskLookup.get(taskId);
        if (!task) {
          return;
        }
        resolvedTotal += 1;
        if (!isTaskComplete(task.status)) {
          pending += 1;
        }
      });
      if (resolvedTotal > 0) {
        totalTaskCount = resolvedTotal;
        pendingTaskCount = pending;
      }
    }

    return {
      id: step.id,
      type: "custom",
      position,
      data: {
        // Existing fields
        title: step.name,
        description: step.description || step.summary || "Click to add details",
        type: step.type,
        status: workflow.status === "Draft" ? "ai-suggested" : "complete",

        // New fields
        stepNumber: stepNumbering?.stepNumber,
        displayId: stepNumbering?.stepNumber,
        displayLabel: stepNumbering?.displayLabel,
        branchCondition: step.branchCondition,
        pendingTaskCount,
        totalTaskCount,
      },
    };
  });
}

/**
 * Convert WorkflowSpec step connections to React Flow edges
 *
 * @param workflow - The WorkflowSpec object containing steps with nextStepIds
 * @returns Array of React Flow edges
 */
export function workflowToEdges(workflow: WorkflowSpec | null): Edge[] {
  if (!workflow || !workflow.steps) {
    return [];
  }

  // Create a set of valid step IDs for validation
  const validStepIds = new Set(workflow.steps.map((step) => step.id));
  const stepById = new Map(workflow.steps.map((step) => [step.id, step]));

  // Flatten all step connections into edges
  return workflow.steps.flatMap((step) =>
    step.nextStepIds
      .filter((targetId) => validStepIds.has(targetId)) // Only include edges to existing steps
      .map((targetId) => {
        const targetStep = stepById.get(targetId);
        const label = targetStep?.branchLabel?.trim();
        const isConditionalEdge = Boolean(label);

        return {
          id: `edge-${step.id}-${targetId}`,
          source: step.id,
          target: targetId,
          type: isConditionalEdge ? "condition" : "default",
          data: isConditionalEdge ? { label } : {},
        };
      })
  );
}

/**
 * Add a new connection to the workflow
 * Updates the source step's nextStepIds array with the target step ID
 *
 * @param workflow - The current WorkflowSpec
 * @param connection - The React Flow connection object
 * @returns Updated WorkflowSpec with the new connection
 */
export function addConnection(workflow: WorkflowSpec, connection: Connection): WorkflowSpec {
  const { source, target } = connection;

  // Validate connection
  if (!source || !target || source === target) {
    return workflow;
  }

  // Update the source step's nextStepIds
  const updatedSteps = workflow.steps.map((step) => {
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
    ...workflow,
    steps: updatedSteps,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove a connection from the workflow
 * Removes the edge ID from the source step's nextStepIds array
 *
 * @param workflow - The current WorkflowSpec
 * @param edgeId - The edge ID to remove (format: "edge-{sourceId}-{targetId}")
 * @returns Updated WorkflowSpec without the connection
 */
export function removeConnection(workflow: WorkflowSpec, edgeId: string): WorkflowSpec {
  // Parse edge ID to extract source and target
  const edgePattern = /^edge-(.+)-(.+)$/;
  const match = edgeId.match(edgePattern);

  if (!match) {
    return workflow;
  }

  const [, sourceId, targetId] = match;

  // Update the source step's nextStepIds
  const updatedSteps = workflow.steps.map((step) => {
    if (step.id === sourceId) {
      return {
        ...step,
        nextStepIds: step.nextStepIds.filter((id) => id !== targetId),
      };
    }
    return step;
  });

  return {
    ...workflow,
    steps: updatedSteps,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reconnect an edge in the workflow
 * Removes the old connection and adds the new one
 *
 * @param workflow - The current WorkflowSpec
 * @param oldEdgeId - The old edge ID (format: "edge-{sourceId}-{targetId}")
 * @param newConnection - The new connection
 * @returns Updated WorkflowSpec with reconnected edge
 */
export function reconnectEdge(workflow: WorkflowSpec, oldEdgeId: string, newConnection: Connection): WorkflowSpec {
  // First remove the old connection
  let updated = removeConnection(workflow, oldEdgeId);
  
  // Then add the new connection
  if (newConnection.source && newConnection.target) {
    updated = addConnection(updated, newConnection);
  }
  
  return updated;
}

/**
 * Calculate node position based on index using a simple grid layout
 *
 * @param index - The step index
 * @returns Position object with x and y coordinates
 */
function computeLayoutPositions(steps: WorkflowStep[]): Map<string, { x: number; y: number }> {
  const key = layoutCacheKey(steps);
  const cached = layoutCache.get(key);
  if (cached) {
    return cached;
  }

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
  const stepById = new Map(steps.map((step) => [step.id, step]));

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
  const sortedLevels = Array.from(levelGroups.entries()).sort((a, b) => a[0] - b[0]);

  sortedLevels.forEach(([level, ids]) => {
    if (ids.length === 0) {
      return;
    }

    type LevelGroup = { parentId?: string; ids: string[] };
    const groups: LevelGroup[] = [];
    const groupIndex = new Map<string, number>();

    ids.forEach((id) => {
      const parentId = stepById.get(id)?.parentStepId;
      const key = parentId ?? `root-${id}`;
      if (!groupIndex.has(key)) {
        groupIndex.set(key, groups.length);
        groups.push({ parentId: parentId ?? undefined, ids: [] });
      }
      groups[groupIndex.get(key)!].ids.push(id);
    });

    const totalWidth = ids.length;
    const levelOffset = (totalWidth - 1) / 2;
    let cursor = 0;
    const y = level * CANVAS_LAYOUT.NODE_Y_GAP;
    
    // Track all positioned nodes at this level to prevent overlaps
    const positionedX = new Set<number>();

    groups.forEach((group) => {
      const { parentId, ids: childIds } = group;
      const groupSize = childIds.length;
      const parentPosition = parentId ? positions.get(parentId) : undefined;

      if (!parentPosition) {
        childIds.forEach((childId) => {
          const x = (cursor - levelOffset) * CANVAS_LAYOUT.NODE_X_GAP;
          positions.set(childId, { x, y });
          positionedX.add(x);
          cursor += 1;
        });
        return;
      }

      // For branches, use increased spacing to prevent overlap
      // Calculate spacing based on number of branches - more branches need more space
      // Use a minimum spacing that scales with the number of branches
      const branchSpacing = Math.max(
        CANVAS_LAYOUT.MIN_BRANCH_SPACING,
        CANVAS_LAYOUT.BRANCH_X_GAP + (groupSize > 2 ? (groupSize - 2) * 100 : 0)
      );
      
      // For single branch, position it to the right of parent to ensure visibility
      // For multiple branches, center them around the parent
      const branchOffset = groupSize === 1 ? 0 : (groupSize - 1) / 2;
      
      childIds.forEach((childId, index) => {
        // For single branch, position to the right; for multiple, center around parent
        let x = groupSize === 1 
          ? parentPosition.x + branchSpacing
          : parentPosition.x + (index - branchOffset) * branchSpacing;
        
        // Ensure no overlap with other nodes at this level
        // If there's a conflict, shift the position
        const tolerance = CANVAS_LAYOUT.MIN_BRANCH_SPACING * 0.6;
        while (Array.from(positionedX).some(pos => Math.abs(pos - x) < tolerance)) {
          x += tolerance;
        }
        
        positions.set(childId, { x, y });
        positionedX.add(x);
      });
      cursor += groupSize;
    });
  });

  while (layoutCache.size >= LAYOUT_CACHE_MAX_SIZE) {
    const oldestKey = layoutCache.keys().next().value;
    if (oldestKey) layoutCache.delete(oldestKey);
  }
  layoutCache.set(key, positions);

  return positions;
}

function isTaskComplete(status?: string | null): boolean {
  return (status ?? "").toLowerCase() === "complete";
}

/**
 * Auto-layout nodes using a simple grid algorithm
 * Recalculates positions for all steps based on their order
 *
 * @param workflow - The WorkflowSpec to layout
 * @returns Updated WorkflowSpec with recalculated positions (note: positions are stored implicitly via index order)
 */
export function autoLayoutNodes(workflow: WorkflowSpec): WorkflowSpec {
  // In this implementation, the layout is implicit based on step order
  // If we need explicit positioning later, we can add a position field to WorkflowStep
  // For now, this function just returns the workflow with an updated timestamp
  // The actual positioning is handled by workflowToNodes()

  return {
    ...workflow,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Helper function to validate if a connection can be added
 * Prevents cycles and other invalid connections
 *
 * @param workflow - The current WorkflowSpec
 * @param connection - The proposed connection
 * @returns true if the connection is valid
 */
export function isValidConnection(workflow: WorkflowSpec, connection: Connection): boolean {
  const { source, target } = connection;

  if (!source || !target || source === target) {
    return false;
  }

  // Check if both nodes exist
  const validStepIds = new Set(workflow.steps.map((step) => step.id));
  if (!validStepIds.has(source) || !validStepIds.has(target)) {
    return false;
  }

  // Check if connection already exists
  const sourceStep = workflow.steps.find((step) => step.id === source);
  if (sourceStep?.nextStepIds.includes(target)) {
    return false;
  }

  // TODO: Add cycle detection if needed
  // For now, we allow all connections that don't create immediate loops

  return true;
}

// Legacy aliases
export const blueprintToNodes = workflowToNodes;
export const blueprintToEdges = workflowToEdges;
