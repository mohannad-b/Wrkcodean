# WRK Copilot Interaction Flow

## Overview

This document describes the complete flow of how WRK Copilot processes user chat messages, generates workflow data, updates the database, and renders the visual canvas and checklist.

---

## 1. User Initiates Chat

**Location**: `components/automations/StudioChat.tsx`

When a user types a message and sends it:

1. **Message is added to local state** (`messages` array)
2. **Auto-trigger logic** (if no assistant response exists):
   - If there's at least one user message but no assistant response, and the blueprint is empty
   - Automatically triggers `/api/automation-versions/[id]/copilot/draft-blueprint`
3. **Manual send**:
   - User clicks send button
   - Calls `/api/automation-versions/[id]/copilot/draft-blueprint` with all messages

**Request Payload**:
```json
{
  "messages": [
    { "role": "user", "content": "I want to automate invoice processing..." },
    { "role": "assistant", "content": "..." }
  ],
  "intakeNotes": "..." // optional
}
```

---

## 2. API Route: Draft Blueprint

**Location**: `app/api/automation-versions/[id]/copilot/draft-blueprint/route.ts`

### Step 2.1: Authentication & Validation
- Validates user session and permissions
- Rate limiting (default: 5 drafts per hour)
- Validates request payload structure
- Checks for off-topic messages

### Step 2.2: Load Current State
```typescript
const detail = await getAutomationVersionDetail(session.tenantId, params.id);
const currentBlueprint = parseBlueprint(detail.version.workflowJson) ?? createEmptyBlueprint();
const requirementsText = detail.version.requirementsText; // Current requirements document
```

**Data Loaded**:
- Current workflow JSON (from `workflow_json` column)
- Current requirements text (from `requirements_text` column)
- Conversation history
- Intake notes

### Step 2.3: Command Detection
- Checks if user message is a direct command (e.g., "delete step 3")
- If command: Executes command directly, no AI call
- If not command: Proceeds to AI generation

### Step 2.4: AI Generation (if not a command)
Calls `buildBlueprintFromChat()` with:
- `userMessage`: Latest user message content
- `currentBlueprint`: Current workflow state
- `conversationHistory`: Last 10 messages
- `requirementsText`: Current requirements document

---

## 3. AI Builder: Processing with OpenAI

**Location**: `lib/blueprint/ai-builder.ts`

### Step 3.1: Prompt Construction
**Function**: `formatBlueprintPrompt(userMessage, currentBlueprint, requirementsText)`

**Prompt Structure**:
```
CURRENT REQUIREMENTS DOCUMENT:
[requirementsText if exists]

CURRENT BLUEPRINT STATE (preserve unless asked to change):
Steps:
  1. [Step name] → connects to 2, 3
  2. [Step name] → (end of flow)
...

USER REQUEST:
[user message]

Remember: Make MINIMAL changes. Preserve all existing structure unless explicitly asked to change it.

Return ONLY valid JSON matching the blueprint format.
```

**System Prompt** (`BLUEPRINT_SYSTEM_PROMPT`):
- Instructs AI to be WRK Copilot
- Defines JSON response format
- Specifies that `requirementsText` should be included when user provides new information
- Defines step, branch, task, and section schemas

### Step 3.2: OpenAI API Call
```typescript
const completion = await openai.chat.completions.create({
  model: BLUEPRINT_MODEL, // Default: "gpt-4-turbo-preview"
  temperature: 0.3,
  max_tokens: 4000,
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: BLUEPRINT_SYSTEM_PROMPT },
    ...conversationHistory.slice(-10),
    { role: "user", content: formattedPrompt }
  ]
});
```

### Step 3.3: Response Parsing
**AI Response Structure**:
```json
{
  "chatResponse": "Got it. Added the approvals branch.",
  "followUpQuestion": "What's the approval threshold?",
  "blueprint": {
    "steps": [...],
    "branches": [...],
    "tasks": [...],
    "sections": {
      "business_requirements": "...",
      "business_objectives": "...",
      "success_criteria": "...",
      "systems": "Shopify, QuickBooks, Gmail"
    }
  },
  "requirementsText": "Comprehensive plain English requirements document..."
}
```

**Parsing Logic**:
- Extracts steps from `blueprint.steps` or top-level `steps`
- Extracts tasks from `blueprint.tasks` or top-level `tasks`
- Extracts branches from `blueprint.branches` or top-level `branches`
- Extracts sections from `blueprint.sections` or top-level `sections`
- Extracts `requirementsText` from top-level or nested in blueprint

### Step 3.4: Merging AI Response with Current Blueprint
**Function**: `mergeAIResponse(currentBlueprint, aiResponse)`

**Merge Strategy**:
1. **Steps**:
   - Matches AI steps to existing steps by `stepNumber`
   - Updates existing steps with AI data (preserves IDs)
   - Creates new steps for new step numbers
   - Validates step types (filters out invalid types like "Outcome")
   - Defaults to "Action" if type is invalid
   - Connects steps via `nextStepIds` based on `nextSteps` array

2. **Sections**:
   - Only updates sections that are **currently empty** in the blueprint
   - Extracts from AI response: `business_requirements`, `business_objectives`, `success_criteria`, `systems`
   - Preserves existing section content (doesn't overwrite)

3. **Branches**:
   - Merges new branches with existing ones
   - Resolves parent/target step IDs

4. **Tasks**:
   - Returns all AI-generated tasks (will be synced to DB separately)

5. **Sanitization**:
   - Removes duplicate edges
   - Reparents orphaned branches
   - Removes cycles
   - Trims excessive connections
   - Attaches orphan nodes

### Step 3.5: Step Numbering
**Function**: `applyStepNumbers(blueprint)`
- Assigns sequential step numbers (1, 2, 3, etc.)
- Handles branches (3A, 3B, etc.)
- Ensures consistent numbering

### Step 3.6: Return Result
Returns:
- `blueprint`: Updated workflow with numbered steps
- `tasks`: Array of AI-generated tasks
- `chatResponse`: AI's conversational response
- `followUpQuestion`: Optional clarifying question
- `sanitizationSummary`: Summary of topology fixes
- `requirementsText`: Updated requirements document (if provided)

---

## 4. Backend: Task Synchronization

**Location**: `lib/blueprint/task-sync.ts`

After AI generation, tasks are synced to the database:

```typescript
const taskAssignments = await syncAutomationTasks({
  tenantId: session.tenantId,
  automationVersionId: params.id,
  aiTasks: generatedTasks,
  blueprint: numberedBlueprint,
});
```

**Process**:
1. Creates/updates tasks in `tasks` table
2. Links tasks to steps via `taskIds` array in each step
3. Assigns tasks to automation version
4. Returns mapping of step IDs to task IDs

---

## 5. Database Update

**Location**: `app/api/automation-versions/[id]/copilot/draft-blueprint/route.ts`

### Step 5.1: Validation
```typescript
const validatedBlueprint = BlueprintSchema.parse({
  ...blueprintWithTasks,
  status: "Draft",
  updatedAt: new Date().toISOString(),
});
```
- Validates against Zod schema
- Ensures all required fields are present
- Validates step types, section keys, etc.

### Step 5.2: Database Write
```typescript
const updatePayload = {
  workflowJson: validatedBlueprint,  // Saved to workflow_json column
  updatedAt: new Date(),
};

// Only update requirementsText if AI provided a non-empty string
if (updatedRequirementsText !== undefined && 
    typeof updatedRequirementsText === 'string' && 
    updatedRequirementsText.trim().length > 0) {
  updatePayload.requirementsText = updatedRequirementsText.trim();
}

await db.update(automationVersions)
  .set(updatePayload)
  .where(eq(automationVersions.id, params.id));
```

**Database Columns Updated**:
- `workflow_json`: Complete workflow object (steps, branches, sections, metadata)
- `requirements_text`: Plain English requirements document (if AI provided update)
- `updated_at`: Timestamp

### Step 5.3: Audit Logging
Creates audit log entry:
- Action: `automation.blueprint.drafted`
- Includes diff summary of changes
- Source: `copilot`

### Step 5.4: Progress Evaluation (Optional)
Calls `evaluateBlueprintProgress()` to assess completion state:
- Analyzes each section's readiness
- Generates progress snapshot
- Saves to `copilot_analyses` table

### Step 5.5: Response
Returns to frontend:
```json
{
  "blueprint": {...},
  "completion": {...},
  "progress": {...},
  "message": {...},
  "thinkingSteps": [...],
  "conversationPhase": "flow"
}
```

---

## 6. Frontend: State Update

**Location**: `app/(studio)/automations/[automationId]/page.tsx`

### Step 6.1: Response Handling
When API response is received:

```typescript
const data = await response.json();
// Updates local blueprint state
setBlueprint(data.blueprint);
// Refreshes automation data
await refreshAutomationPreservingSelection();
```

### Step 6.2: Blueprint State
The `blueprint` state contains:
- `steps`: Array of workflow steps
- `branches`: Array of conditional branches
- `sections`: Array of section objects with `key`, `title`, `content`
- `metadata`: Includes `nodePositions` for canvas layout

---

## 7. Canvas Rendering

**Location**: `lib/blueprint/canvas-utils.ts` → `blueprintToNodes()`

### Step 7.1: Node Generation
**Function**: `blueprintToNodes(blueprint, taskLookup)`

**Process**:
1. **Step Numbering**: Generates step numbers for all steps
2. **Position Calculation**:
   - Uses stored positions from `blueprint.metadata.nodePositions` if available
   - Otherwise computes layout using `computeLayoutPositions()`
3. **Node Creation**: Converts each step to a React Flow node:
   ```typescript
   {
     id: step.id,
     type: "custom",
     position: { x, y },
     data: {
       title: step.name,
       description: step.summary,
       type: step.type, // "Trigger", "Action", "Decision", etc.
       status: "complete" | "ai-suggested" | "draft",
       stepNumber: step.stepNumber,
       pendingTaskCount: ...,
       totalTaskCount: ...
     }
   }
   ```

### Step 7.2: Layout Algorithm
**Function**: `computeLayoutPositions(blueprint)`

**Layout Rules**:
- **Horizontal spacing**: `NODE_X_GAP = 400px` between steps
- **Vertical spacing**: `NODE_Y_GAP = 240px` between levels
- **Branch spacing**: `BRANCH_X_GAP = 500px` + dynamic spacing based on branch size
- **Prevents overlap**: Detects and resolves horizontal conflicts between branches

**Algorithm**:
1. Groups steps by level (distance from trigger)
2. Assigns X positions based on step order
3. Adjusts for branches (conditional paths)
4. Prevents horizontal overlap between branches from different parents
5. Stores positions in `blueprint.metadata.nodePositions`

### Step 7.3: Edge Generation
**Function**: `blueprintToEdges(blueprint)`

Converts step connections (`nextStepIds`) to React Flow edges:
```typescript
{
  id: `edge-${fromId}-${toId}`,
  source: fromStep.id,
  target: toStep.id,
  type: "default"
}
```

### Step 7.4: Canvas Display
**Component**: `components/automations/StudioCanvas.tsx`

- Renders React Flow canvas with nodes and edges
- Handles drag, drop, and connection interactions
- Updates positions back to blueprint when user moves nodes

---

## 8. Checklist Rendering

**Location**: `app/(studio)/automations/[automationId]/page.tsx`

### Step 8.1: Checklist Items
**Required Items** (4 total):
1. Business Requirements
2. Business Objectives
3. Success Criteria
4. Systems

### Step 8.2: Completion Check
```typescript
const checklistItems = REQUIRED_CHECKLIST_ITEMS.map((item) => {
  const hasContent = blueprint?.sections?.some(
    (s) => s.key === item.sectionKey && s.content?.trim().length > 0
  );
  return {
    id: item.id,
    label: item.label,
    sectionKey: item.sectionKey,
    completed: hasContent ?? false,
  };
});
```

**Logic**:
- Checks if section exists in `blueprint.sections` array
- Checks if section has non-empty `content` string
- Shows checkmark if content exists, empty circle if not

### Step 8.3: Proceed Button State
```typescript
const readyForBuild = checklistItems.every((item) => item.completed);
```

**Button Behavior**:
- **Enabled**: When all 4 required items have content
- **Disabled**: When any required item is missing
- **Tooltip**: Shows "We need a little bit more information..." when disabled

---

## 9. Requirements View

**Location**: `components/automations/RequirementsView.tsx`

### Step 9.1: Display
- Shows `requirementsText` from database in editable textarea
- User can edit and save directly

### Step 9.2: Save
- PATCH request to `/api/automation-versions/[id]`
- Updates `requirements_text` column
- Does NOT update workflow JSON

---

## 10. Data Flow Summary

### What Feeds the Canvas?
- **Source**: `blueprint.steps` array from `workflow_json` column
- **Process**: `blueprintToNodes()` converts steps to React Flow nodes
- **Layout**: `computeLayoutPositions()` calculates X/Y positions
- **Updates**: When user moves nodes, positions saved to `blueprint.metadata.nodePositions`

### What Feeds the Checklist?
- **Source**: `blueprint.sections` array from `workflow_json` column
- **Process**: Checks each section's `content` field for non-empty strings
- **Keys Checked**: `business_requirements`, `business_objectives`, `success_criteria`, `systems`
- **Updates**: When AI returns sections in response, merged into blueprint (only if section is currently empty)

### What Populates the Database?

**On AI Response**:
1. **`workflow_json` column**:
   - Complete workflow object
   - Includes: `steps`, `branches`, `sections`, `metadata`
   - Always updated when AI responds

2. **`requirements_text` column**:
   - Plain English requirements document
   - Only updated if AI explicitly returns `requirementsText` in response
   - Must be non-empty string to save

3. **`tasks` table**:
   - Individual task records
   - Linked to steps via `taskIds` array in each step
   - Created/updated via `syncAutomationTasks()`

4. **`copilot_messages` table**:
   - Conversation history
   - Each user message and AI response saved

5. **`copilot_analyses` table** (optional):
   - Progress snapshot
   - Section-by-section readiness assessment

### Initial Requirements Text Population

**When Creating New Automation**:
- User enters process description in "New Automation" form
- Saved to `requirements_text` column during automation creation
- This becomes the initial requirements document
- Included in all subsequent AI prompts

---

## 11. Key Data Structures

### Workflow JSON Structure
```typescript
{
  version: 1,
  status: "Draft" | "ReadyForQuote" | "ReadyToBuild",
  summary: string,
  sections: [
    {
      id: string,
      key: "business_requirements" | "business_objectives" | ...,
      title: string,
      content: string  // This is what feeds the checklist
    }
  ],
  steps: [
    {
      id: string,
      stepNumber: string,
      type: "Trigger" | "Action" | "Decision" | "Exception" | "Human",
      name: string,
      summary: string,
      description: string,
      systemsInvolved: string[],
      nextStepIds: string[],
      taskIds: string[]
    }
  ],
  branches: [...],
  metadata: {
    nodePositions?: { [stepId]: { x: number, y: number } }
  }
}
```

### Requirements Text
- Plain text string
- Stored in `requirements_text` column
- Separate from workflow JSON
- Editable by user in Requirements View
- Included in AI prompts for context

---

## 12. Complete Flow Diagram

```
User Types Message
    ↓
StudioChat Component
    ↓
POST /api/automation-versions/[id]/copilot/draft-blueprint
    ↓
Load: workflowJson, requirementsText from DB
    ↓
buildBlueprintFromChat()
    ├─ Format prompt (includes requirementsText)
    ├─ Call OpenAI API
    ├─ Parse response (steps, tasks, sections, requirementsText)
    ├─ Merge with current blueprint
    ├─ Apply step numbers
    └─ Return updated blueprint + tasks + requirementsText
    ↓
syncAutomationTasks() → Create/update tasks in DB
    ↓
Validate blueprint schema
    ↓
Update DB:
    ├─ workflow_json = updated blueprint
    ├─ requirements_text = updated requirements (if provided)
    └─ updated_at = now()
    ↓
Return response to frontend
    ↓
Frontend Updates:
    ├─ setBlueprint(data.blueprint)
    ├─ Refresh automation data
    └─ Update UI
    ↓
Canvas Rendering:
    ├─ blueprintToNodes() → Converts steps to React Flow nodes
    ├─ blueprintToEdges() → Converts connections to edges
    └─ StudioCanvas renders nodes/edges
    ↓
Checklist Rendering:
    ├─ Check blueprint.sections for content
    ├─ Show checkmarks for completed sections
    └─ Enable/disable "Proceed to Build" button
```

---

## 13. Important Notes

### Section Population Rules
- AI only populates sections that are **currently empty**
- If a section already has content, AI does NOT overwrite it
- This prevents losing user edits

### Requirements Text Rules
- AI includes `requirementsText` in response when user provides new information
- Only saved if it's a non-empty string
- If AI doesn't return it, existing value is preserved

### Step Merging Rules
- Steps matched by `stepNumber` (not ID)
- Existing steps are updated, not replaced
- New steps are created for new step numbers
- Step IDs are preserved across updates

### Canvas Position Persistence
- User-dragged positions saved to `blueprint.metadata.nodePositions`
- On reload, positions restored from metadata
- If no stored positions, layout algorithm computes new positions

---

## 14. Error Handling

- **Rate Limiting**: Max 5 drafts per hour (configurable)
- **Validation Errors**: Zod schema validation catches invalid data
- **AI Errors**: Gracefully handled, error message shown to user
- **Network Errors**: Retry logic in frontend
- **Empty Responses**: Fallback to current state

---

This flow ensures that:
1. ✅ User chat messages are processed by AI
2. ✅ Workflow steps are generated and saved
3. ✅ Requirements document is maintained and updated
4. ✅ Tasks are created and linked to steps
5. ✅ Canvas is drawn from workflow data
6. ✅ Checklist reflects section completion
7. ✅ All data persists to database

