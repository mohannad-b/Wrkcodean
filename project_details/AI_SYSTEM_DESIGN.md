<!-- AI_SYSTEM_DESIGN.md -->
# WRK Copilot AI System Design

## 1. Goals

- Turn messy human inputs (text, docs, screenshots, recordings) into **useful automation blueprints**.
- Assist with **requirements capture**, **blueprint proposal**, and **explanations**.
- Do it in a way that is:
  - Tenant-safe (no cross-tenant leakage),
  - Observable,
  - Easy to iterate on (prompt changes, evaluation).

This doc focuses on **how AI ingests and uses user data during blueprint development.**

---

## 2. Responsibilities

V1 AI focuses on:

1. **Requirements Extraction**
   - From:
     - Free-text descriptions (chat, forms),
     - Uploaded docs (specs, process docs),
     - Screenshots / simple recordings (future).
   - Into:
     - Systems involved (Salesforce, HubSpot, Gmail, etc.),
     - Triggers, actions, conditions,
     - Data fields, SLAs, edge cases.

2. **Blueprint Drafting**
   - Generate an initial `blueprint_json`:
     - Nodes (triggers/actions/conditions),
     - Edges (flow between steps).
   - Annotate nodes with structured metadata (e.g. system name, step description).

3. **Explaining & Refining**
   - Summarize current blueprint in plain English.
   - Answer “what happens if…” questions.
   - Suggest missing steps or simplifications.

---

## 3. Data Flow Overview

### 3.1 Studio Intake Flow

1. **User interacts with Studio Chat / Intake Form**:
   - Messages captured in `messages` (type `client`).
   - File uploads stored in object storage; metadata stored in DB.

2. **AI Ingestion Trigger**:
   - On events like:
     - New automation created.
     - User uploads doc “Process_Spec.pdf”.
     - User clicks “Generate Draft Blueprint”.
   - A job is enqueued on `ai-ingestion` queue:
     ```json
     {
       "tenant_id": "...",
       "automation_id": "...",
       "automation_version_id": "...",
       "input_sources": [
         { "type": "message_ids", "ids": ["..."] },
         { "type": "document_urls", "urls": ["..."] }
       ]
     }
     ```

3. **AI Ingestion Worker**:
   - Fetches inputs (messages + docs).
   - Normalizes into a **requirements document**:
     ```json
     {
       "systems": ["HubSpot", "Gmail"],
       "triggers": [...],
       "steps": [...],
       "constraints": [...],
       "volumes": { "estimated_per_month": 2000 }
     }
     ```
   - Calls LLM with prompt templates.
   - Receives proposed `blueprint_json` + annotations.

4. **Automation Version Update**:
   - `automation_versions.blueprint_json` updated.
   - Optionally `requirements_json` and `ai_annotations` saved.
   - `intake_progress` bumped (e.g. 40–80% depending on coverage).

5. **Studio UI Refresh**:
   - Blueprint canvas reloads from latest `blueprint_json`.
   - Studio Chat shows AI message: “Here’s a first draft of your workflow…”

---

## 4. Data Structures

### 4.1 Requirements JSON (Intermediate Representation)

We keep a structured representation alongside the blueprint:

```json
{
  "systems": [
    { "name": "HubSpot", "role": "CRM" },
    { "name": "Gmail", "role": "Email" }
  ],
  "triggers": [
    {
      "id": "t1",
      "description": "New lead submitted through website form",
      "source_system": "HubSpot"
    }
  ],
  "steps": [
    {
      "id": "s1",
      "description": "Enrich lead with Clearbit",
      "system": "Clearbit",
      "inputs": ["email"],
      "outputs": ["company", "title"]
    }
  ],
  "conditions": [
    {
      "id": "c1",
      "description": "If account exists in CRM",
      "system": "HubSpot"
    }
  ],
  "volumes": {
    "estimated_per_month": 2000
  },
  "notes": [
    "High priority leads should be flagged for sales follow-up within 2 hours."
  ]
}

4.2 Blueprint JSON (Execution-Oriented)

blueprint_json is the actual canvas representation:

{
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "data": {
        "system": "HubSpot",
        "event": "new_lead",
        "summary": "New lead submitted via website form"
      }
    },
    {
      "id": "action-1",
      "type": "action",
      "data": {
        "system": "Clearbit",
        "action": "enrich_contact",
        "summary": "Enrich lead with company/title"
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "trigger-1",
      "target": "action-1",
      "label": "on new lead"
    }
  ]
}

5. Prompting & Guardrails

5.1 Prompt Templates (Conceptual)

Requirements Extraction Prompt (LLM):
	- System message:
	- “You are an expert business process analyst who turns messy descriptions into structured workflow requirements. Never invent systems or steps that are not clearly implied.”
	- User/assistant parts:
	- Entire intake conversation (or a summary).
	- Doc contents (truncated/summarized if large).
	- Output:
	- JSON matching requirements_json schema.

Blueprint Proposal Prompt:
	- System:
	- “You are an automation architect. Produce a graph of steps as JSON nodes and edges that matches the provided requirements schema. Only use systems explicitly listed.”
	- Input:
	- requirements_json
	- Output:
	- blueprint_json matching schema.

5.2 Guardrails
	- Tenant Isolation:
	- No cross-tenant examples in prompts.
	- Few-shot examples must be generic, not based on real tenant data.
	- Connector Catalog Awareness:
	- Model sees a list of supported systems/actions to avoid hallucinating unsupported connectors.
	- Length & Cost Controls:
	- Document inputs summarized before sending to LLM.
	- Hard token limits enforced.

⸻

6. Feedback & Human-in-the-Loop

6.1 UX Hooks

Within Studio:
	- Ops or client can:
	- Edit generated nodes/edges directly.
	- Add comments like “Step 3 is wrong; we use Zendesk, not Intercom.”
	- System logs:
	- Which AI suggestions were accepted, modified, or deleted.
	- These can be captured as simple events:

{
  "tenant_id": "...",
  "automation_version_id": "...",
  "event": "ai_step_deleted",
  "step_id": "action-1"
}

6.2 Offline Evaluation
	- Keep a small test set of:
	- Inputs (intake + docs),
	- Expected requirements_json / blueprint_json.
	- Regularly run evaluations when prompts or provider change:
	- Compare node coverage, system detection accuracy, trigger/action mapping.

⸻

7. Error Handling & Fallbacks
	- If AI ingestion fails:
	- Log error with tenant_id, automation_version_id, but no raw content.
	- Show user a friendly message: “We couldn’t generate a draft; you can still build manually.”
	- Timeouts:
	- Worker cancels LLM call after configured timeout.
	- Job can be retried a limited number of times with exponential backoff.
	- Partial results:
	- If only requirements_json succeeds but blueprint fails, save requirements and ask user to trigger blueprint generation later.

⸻

8. Security & Privacy
	- Inputs:
	- Only user-provided text/docs from their tenant.
	- No cross-tenant data or global logs sent to LLM.
	- Storage:
	- Don’t store full LLM prompts/responses unless needed for debugging.
	- If stored, strip PII where possible and keep them under a separate retention policy.
	- Providers:
	- Use LLM providers that support enterprise policies (no training on customer data, strong data isolation).

⸻

9. Future Enhancements
	- Recording → Blueprint:
	- Capture screen/voice, transcribe, then feed into the same requirements pipeline.
	- Optimization Suggestions:
	- Analyze usage_aggregates and propose cost/performance optimizations.
	- Self-Healing:
	- When repeated run failures occur, propose blueprint changes or error handling patterns.
