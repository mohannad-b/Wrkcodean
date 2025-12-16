import type { Node, Edge, Connection } from "reactflow";
import type { Blueprint, BlueprintStep } from "./types";
import { generateStepNumbers } from "./step-numbering";

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
  type: BlueprintStep["type"];
  status: "ai-suggested" | "complete" | "draft";
  isNew?: boolean;
  isUpdated?: boolean;
  stepNumber?: string;
  displayLabel?: string;
  branchCondition?: string;
  pendingTaskCount?: number;
  totalTaskCount?: number;
}

/**
 * Convert Blueprint steps to React Flow nodes
 *
 * @param blueprint - The Blueprint object containing steps
 * @returns Array of React Flow nodes
 */
export function blueprintToNodes(
  blueprint: Blueprint | null,
  taskLookup?: Map<string, { status?: string | null }>
): Node<CanvasNodeData>[] {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:38',message:'blueprintToNodes entry',data:{hasBlueprint:!!blueprint,hasSteps:!!blueprint?.steps,stepCount:blueprint?.steps?.length??0,steps:blueprint?.steps?.map(s=>({id:s.id,name:s.name,stepNumber:s.stepNumber,parentStepId:s.parentStepId,nextStepIds:s.nextStepIds,type:s.type}))??[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  if (!blueprint || !blueprint.steps) {
    return [];
  }

  // Generate step numbers for all steps
  const numbering = generateStepNumbers(blueprint);
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:47',message:'After generateStepNumbers',data:{numberingSize:numbering.size,numbering:Array.from(numbering.entries()).map(([id,info])=>({id,stepNumber:info.stepNumber,displayLabel:info.displayLabel}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  // Calculate positions - use stored positions if available, otherwise compute layout
  const storedPositions = blueprint.metadata?.nodePositions;
  const computedPositions = computeLayoutPositions(blueprint.steps);
  
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

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:64',message:'Before mapping steps to nodes',data:{stepCount:blueprint.steps.length,positionsSize:positions.size,storedPositionsCount:storedPositions?Object.keys(storedPositions).length:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  return blueprint.steps.map((step, index) => {
    const position = positions.get(step.id) ?? { x: 0, y: index * CANVAS_LAYOUT.NODE_Y_GAP };

    // Get numbering info for this step
    const stepNumbering = numbering.get(step.id);
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:68',message:'Creating node for step',data:{stepId:step.id,stepName:step.name,stepNumber:step.stepNumber,index,position,hasNumbering:!!stepNumbering},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
    // #endregion

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
        status: blueprint.status === "Draft" ? "ai-suggested" : "complete",

        // New fields
        stepNumber: stepNumbering?.stepNumber,
        displayLabel: stepNumbering?.displayLabel,
        branchCondition: step.branchCondition,
        pendingTaskCount,
        totalTaskCount,
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
  const stepById = new Map(blueprint.steps.map((step) => [step.id, step]));

  // Flatten all step connections into edges
  return blueprint.steps.flatMap((step) =>
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
 * Reconnect an edge in the blueprint
 * Removes the old connection and adds the new one
 *
 * @param blueprint - The current Blueprint
 * @param oldEdgeId - The old edge ID (format: "edge-{sourceId}-{targetId}")
 * @param newConnection - The new connection
 * @returns Updated Blueprint with reconnected edge
 */
export function reconnectEdge(blueprint: Blueprint, oldEdgeId: string, newConnection: Connection): Blueprint {
  // First remove the old connection
  let updated = removeConnection(blueprint, oldEdgeId);
  
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
function computeLayoutPositions(steps: BlueprintStep[]): Map<string, { x: number; y: number }> {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:251',message:'computeLayoutPositions entry',data:{stepCount:steps.length,steps:steps.map(s=>({id:s.id,name:s.name,stepNumber:s.stepNumber,parentStepId:s.parentStepId,nextStepIds:s.nextStepIds}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
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
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:266',message:'After initial indegree calculation',data:{indegreeMap:Array.from(indegree.entries()).map(([id,count])=>({id,count,parentStepId:steps.find(s=>s.id===id)?.parentStepId,hasParentButNoIncoming:steps.find(s=>s.id===id)?.parentStepId&&count===0}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  const queue: string[] = [];
  const levels = new Map<string, number>();
  const stepById = new Map(steps.map((step) => [step.id, step]));

  indegree.forEach((count, id) => {
    if (count === 0) {
      queue.push(id);
      const step = stepById.get(id);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:271',message:'Root node found',data:{id,count,parentStepId:step?.parentStepId,stepNumber:step?.stepNumber,name:step?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      levels.set(id, 0);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const level = levels.get(current) ?? 0;
    const targets = adjacency.get(current);
    // #region agent log
    const currentStep = stepById.get(current);
    fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:278',message:'Processing node in queue',data:{current,level,targetCount:targets?.size??0,targets:Array.from(targets??[]),currentStep:{name:currentStep?.name,stepNumber:currentStep?.stepNumber,parentStepId:currentStep?.parentStepId}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:294',message:'After topological sort',data:{levels:Array.from(levels.entries()).map(([id,level])=>({id,level,parentStepId:stepById.get(id)?.parentStepId,stepNumber:stepById.get(id)?.stepNumber,name:stepById.get(id)?.name}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

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
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:305',message:'Level groups before positioning',data:{levelGroups:Array.from(levelGroups.entries()).map(([level,ids])=>({level,ids,steps:ids.map(id=>({id,name:stepById.get(id)?.name,stepNumber:stepById.get(id)?.stepNumber,parentStepId:stepById.get(id)?.parentStepId}))}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

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
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:336',message:'Positioning group',data:{level,parentId,groupSize,childIds,parentPosition,hasParentPosition:!!parentPosition},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

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
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:370',message:'Positioned branch node',data:{childId,index,x,y,parentId,stepNumber:stepById.get(childId)?.stepNumber,name:stepById.get(childId)?.name,groupSize},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
      });
      cursor += groupSize;
    });
  });
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'canvas-utils.ts:377',message:'Final positions computed',data:{positions:Array.from(positions.entries()).map(([id,pos])=>({id,x:pos.x,y:pos.y,stepNumber:stepById.get(id)?.stepNumber,name:stepById.get(id)?.name,parentStepId:stepById.get(id)?.parentStepId}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  return positions;
}

function isTaskComplete(status?: string | null): boolean {
  return (status ?? "").toLowerCase() === "complete";
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
