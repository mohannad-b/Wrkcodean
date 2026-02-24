# Copilot Chat Message Flow and Question-Asking Logic

## Overview

This document explains:
1. **How messages are constructed and sent to OpenAI**
2. **The logic that determines what questions to ask users about their workflow**

---

## 1. Message Flow to OpenAI

### 1.1 Entry Point

When a user sends a message in `StudioChat.tsx`:
- Message is saved to database via `/api/automation-versions/[id]/messages`
- Then calls `/api/automation-versions/[id]/copilot/draft-blueprint`

**Location**: `app/api/automation-versions/[id]/copilot/draft-blueprint/route.ts`

### 1.2 Message Construction

**Location**: `lib/blueprint/ai-builder-simple.ts` → `buildBlueprintFromChat()`

The messages array sent to OpenAI is constructed as follows:

```typescript
const messages: ConversationMessage[] = [
  { role: "system", content: BLUEPRINT_SYSTEM_PROMPT },
  ...conversationHistory.slice(-10),  // Last 10 messages from conversation
  { role: "user", content: formatBlueprintPrompt(userMessage, currentBlueprint, requirementsText) },
];
```

### 1.3 System Prompt

**Location**: `lib/ai/prompts.ts` → `BLUEPRINT_SYSTEM_PROMPT`

The system prompt defines:
- **Identity**: "You are WRK Copilot, an operator-friendly automation consultant"
- **Response Format**: Must return JSON with `chatResponse`, `followUpQuestion`, and `blueprint`
- **Question Rules**: 
  - **ALWAYS include exactly one follow-up question** that uncovers the next most important detail
  - Only skip the question if the user explicitly says the blueprint is complete
  - Focus on: systems, data, exceptions, approvals, human touchpoints

### 1.4 User Prompt Formatting

**Location**: `lib/ai/prompts.ts` → `formatBlueprintPrompt()`

The user message is formatted to include:

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

### 1.5 OpenAI API Call

**Location**: `lib/blueprint/ai-builder-simple.ts` → `buildBlueprintFromChat()`

```typescript
const completion = await openai.chat.completions.create({
  model: BLUEPRINT_MODEL,  // Default: "gpt-4-turbo-preview"
  temperature: 0.3,
  max_tokens: 4000,
  response_format: { type: "json_object" },
  messages,  // Array constructed above
});
```

### 1.6 Expected Response Format

The AI must return JSON in this structure:

```json
{
  "chatResponse": "Two-sentence max acknowledgement in the user's tone.",
  "followUpQuestion": "Optional SINGLE clarifying question (omit if not needed).",
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

**Key Points**:
- `followUpQuestion` is **required** unless user says blueprint is complete
- `requirementsText` is included when user provides new information
- Sections are only populated if currently empty (preserves user edits)

---

## 2. Logic for Getting More Information from Users

The system uses a **multi-layered approach** to determine what questions to ask:

### 2.1 Conversation Phase Detection

**Location**: `lib/ai/copilot-orchestrator.ts` → `determineConversationPhase()`

The system determines the current phase based on:

```typescript
function determineConversationPhase(
  blueprint: Blueprint | null | undefined,
  messages: Array<{ role: string }>
): ConversationPhase {
  const userMessages = messages.filter((message) => message.role === "user").length;
  const stepCount = blueprint?.steps?.length ?? 0;
  const hasBusinessObjectives = hasSectionContent(blueprint, "business_objectives");
  const hasExceptions = hasSectionContent(blueprint, "exceptions");
  const hasHumanTouchpoints = hasSectionContent(blueprint, "human_touchpoints");

  if (userMessages <= 2 && stepCount === 0) {
    return "discovery";
  }

  if (stepCount < 3) {
    return "flow";
  }

  if (stepCount < 7 && !hasBusinessObjectives) {
    return "flow";
  }

  if (!hasExceptions || !hasHumanTouchpoints) {
    return "details";
  }

  return "validation";
}
```

**Phase Definitions**:
- **`discovery`**: Early stage, ≤2 user messages, no steps yet
- **`flow`**: Building the workflow structure, <3 steps OR <7 steps without business objectives
- **`details`**: Refining details, missing exceptions or human touchpoints
- **`validation`**: Nearly complete, confirming everything is captured

### 2.2 Phase-Specific Prompts

**Location**: `lib/ai/prompts.ts` → `buildCopilotSystemPrompt()`

Each phase has specific instructions for what to ask:

#### Discovery Phase (`DISCOVERY_PHASE_PROMPT`)

**Focus**:
- Let user explain in their own words first
- Identify TRIGGER and GOAL
- Ask 2-3 clarifying questions maximum

**What to Ask**:
- What initiates this process? (manual action, schedule, event, incoming data)
- What's the end result they want?
- What systems or tools are involved?

**What NOT to Ask**:
- Specific data fields (too early)
- Exception handling (too early)
- Exact technical implementation (never)

**Example Questions**:
- ✅ "So this runs whenever you get a new invoice in your inbox, or is it on a schedule?"
- ❌ "What should trigger this workflow? Please specify the trigger type."

#### Flow Phase (`FLOW_PHASE_PROMPT`)

**Focus**:
- Propose a draft flow (3-7 steps)
- Ask about unclear steps or transitions
- Identify which systems connect to which
- Clarify what data moves between steps

**What to Ask**:
- Questions about gaps in the flow
- Questions about system/data points
- Questions about step transitions

**Example Response Format**:
```
Here's what I'm understanding:
1. [Trigger step]
2. [Processing step]
3. [Action step]
4. [Notification/completion step]

Quick questions:
- [One specific question about a gap]
- [One question about a system/data point]
```

#### Details Phase (`DETAILS_PHASE_PROMPT`)

**Focus**:
- Probe for specific data fields if needed
- Ask about exception handling
- Identify human touchpoints
- Clarify ambiguous steps

**What to Ask**:
- "Which specific fields matter most here?"
- "What should happen if the system is down?"
- "Does anyone need to approve before this runs?"
- "How should we alert your team?"

**Example Format**:
```
A few edge cases to cover:
- [Question about error scenario]
- [Question about who needs to know]
- [Question about data validation]
```

#### Validation Phase (`VALIDATION_PHASE_PROMPT`)

**Focus**:
- Present the complete workflow clearly
- Highlight any remaining unknowns
- Ask if they want to refine anything
- Confirm it's ready for the build team

**What to Ask**:
- "Is there anything you'd like to adjust or add?"
- Only ask if there are clear gaps

**What NOT to Do**:
- Keep asking for more details if it's complete
- Ask hypothetical questions
- Dig into minor edge cases unless the user brings them up

### 2.3 System Prompt Question Rules

**Location**: `lib/ai/prompts.ts` → `BLUEPRINT_SYSTEM_PROMPT`

The system prompt includes explicit rules:

```
# CHAT RESPONSE RULES
- Never summarize the full process—the canvas already shows it.
- Keep acknowledgements ≤ 2 sentences total.
- ALWAYS include exactly one follow-up question that uncovers the next most important detail (systems, data, exceptions, approvals, human touchpoints). Only skip the question if the user explicitly says the blueprint is complete.
- Use the user's terminology (systems, teams, acronyms).
- When you believe the workflow is covered, end by asking if anything is missing or if the user would like extra recommendations (e.g., "Let me know if anything's missing or if you'd like me to suggest additional refinements.").
```

**Key Rules**:
1. **Always ask one question** unless blueprint is explicitly complete
2. **Focus on next most important detail**: systems → data → exceptions → approvals → human touchpoints
3. **Use natural language**: Sound like a helpful colleague, not a chatbot
4. **Don't repeat questions**: Check conversation history
5. **Don't ask what you can infer**: Use context from existing blueprint

### 2.4 Thinking Steps (UI Feedback)

**Location**: `lib/ai/copilot-orchestrator.ts` → `generateThinkingSteps()`

The system generates contextual "thinking" steps shown to the user while processing:

```typescript
function generateThinkingSteps(
  phase: ConversationPhase,
  latestUserMessage?: string,
  blueprint?: Blueprint | null
): CopilotThinkingStep[]
```

**Examples**:
- **Discovery**: "Understanding your workflow requirements and goals" → "Identifying the starting trigger point" → "Framing key questions about outcomes"
- **Flow**: "Step 1: Setting up the trigger from Gmail" → "Step 2: Connecting data flow between Gmail and QuickBooks" → "Step 3: Drafting the complete workflow structure"
- **Details**: "Analyzing approval thresholds" → "Identifying human touchpoints" → "Tightening the workflow logic"

These steps are contextual based on:
- Systems mentioned in the message
- Workflow keywords (invoice, lead, approval, etc.)
- Current blueprint state

---

## 3. Complete Flow Diagram

```
User sends message
    ↓
StudioChat.tsx → POST /api/automation-versions/[id]/copilot/draft-blueprint
    ↓
Load from DB:
  - Current blueprint (workflow_json)
  - Requirements text (requirements_text)
  - Conversation history (last 10 messages)
    ↓
Determine conversation phase:
  - discovery / flow / details / validation
    ↓
Build messages array:
  [
    { role: "system", content: BLUEPRINT_SYSTEM_PROMPT },
    ...conversationHistory.slice(-10),
    { role: "user", content: formatBlueprintPrompt(...) }
  ]
    ↓
Call OpenAI API:
  - model: gpt-4-turbo-preview
  - temperature: 0.3
  - response_format: json_object
    ↓
Parse AI response:
  {
    chatResponse: "...",
    followUpQuestion: "...",  // ← This is the question logic
    blueprint: {...},
    requirementsText: "..."
  }
    ↓
Merge with current blueprint (preserve IDs, positions)
    ↓
Save to DB:
  - workflow_json
  - requirements_text (if updated)
    ↓
Return to frontend:
  - blueprint
  - message (includes followUpQuestion)
  - thinkingSteps
  - conversationPhase
    ↓
Frontend displays:
  - Assistant message with followUpQuestion
  - Updated blueprint on canvas
  - Thinking steps (if processing)
```

---

## 4. Key Decision Points

### 4.1 When to Ask Questions

**Always ask**:
- After processing a user message (unless explicitly complete)
- When moving to a new phase
- When critical information is missing (systems, triggers, exceptions)

**Don't ask**:
- If user explicitly says "that's complete" or "looks good"
- If you already asked the same question in recent messages
- If the answer can be inferred from existing blueprint

### 4.2 What to Ask About (Priority Order)

1. **Systems** (highest priority)
   - Which systems are involved?
   - What credentials/access is needed?

2. **Data**
   - What specific fields matter?
   - What data moves between steps?

3. **Exceptions**
   - What if X fails?
   - How to handle errors?

4. **Approvals**
   - Who needs to approve?
   - What are the thresholds?

5. **Human Touchpoints**
   - Where do humans need to review?
   - Who gets notified?

### 4.3 Question Quality Rules

**Good Questions**:
- ✅ Natural and conversational
- ✅ Specific to their workflow
- ✅ Focused on one detail
- ✅ Use their terminology

**Bad Questions**:
- ❌ Generic/form-like
- ❌ Too technical
- ❌ Multiple questions bundled
- ❌ Asking what you can infer

---

## 5. Example Question Flow

### Scenario: Invoice Processing Automation

**Message 1** (Discovery):
- User: "I want to automate invoice processing"
- AI Question: "So this runs whenever you get a new invoice in your inbox, or is it on a schedule?"

**Message 2** (Flow):
- User: "When I get an email with an invoice attachment"
- AI Question: "Which accounting system should the invoice data go to—QuickBooks, Xero, or something else?"

**Message 3** (Flow):
- User: "QuickBooks"
- AI Question: "Do you need any approvals before posting to QuickBooks, or should it go straight in?"

**Message 4** (Details):
- User: "If it's over $1000, my manager needs to approve"
- AI Question: "How should your manager approve—via email, Slack, or in this system?"

**Message 5** (Details):
- User: "Email is fine"
- AI Question: "What should happen if the invoice can't be matched to a vendor or purchase order?"

**Message 6** (Validation):
- User: "Send it to me for manual review"
- AI Question: "Is there anything else you'd like to add or adjust before we finalize this?"

---

## 6. Files Reference

### Core Files

1. **Message Construction**:
   - `lib/blueprint/ai-builder-simple.ts` - Builds messages array, calls OpenAI
   - `lib/ai/prompts.ts` - System prompts and user prompt formatting

2. **Question Logic**:
   - `lib/ai/copilot-orchestrator.ts` - Phase detection and thinking steps
   - `lib/ai/prompts.ts` - Phase-specific prompts

3. **API Endpoint**:
   - `app/api/automation-versions/[id]/copilot/draft-blueprint/route.ts` - Main handler

4. **Frontend**:
   - `components/automations/StudioChat.tsx` - Chat UI component

5. **Documentation**:
   - `docs/WRK_COPILOT_INTERACTION_FLOW.md` - Complete interaction flow

---

## 7. Configuration

### Environment Variables

- `OPENAI_API_KEY` - Required for AI calls
- `WORKFLOW_MODEL` / `BLUEPRINT_MODEL` - Default: "gpt-4o" (faster, better structured output)
- `OPENAI_BLUEPRINT_PROGRESS_MODEL` - Default: "gpt-4o-mini"
- `COPILOT_DRAFTS_PER_HOUR` - Rate limit (default: 5)

### Model Parameters

- **Temperature**: 0.3 (lower = more deterministic)
- **Max Tokens**: 4000
- **Response Format**: JSON object (required)

---

## 8. Summary

The copilot uses a **phase-based, context-aware approach** to ask questions:

1. **Detects conversation phase** based on message count, step count, and blueprint completeness
2. **Uses phase-specific prompts** to guide what to ask
3. **System prompt enforces** always asking one question (unless complete)
4. **Prioritizes questions** by importance: systems → data → exceptions → approvals → human touchpoints
5. **Uses natural language** and user's terminology
6. **Avoids repetition** by checking conversation history
7. **Infers when possible** rather than asking obvious questions

The goal is to **gather information efficiently** while feeling like a **helpful colleague**, not an interrogative form.

