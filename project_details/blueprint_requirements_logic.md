# Blueprint Requirements Logic Map

Audit date: 2025-12-03  
Scope: Blueprint tab (requirements capture + checklist chips + readiness prompts).

---

## File Inventory (full paths + summaries)

1. `/app/(studio)/automations/[automationId]/page.tsx`  
   Handles the entire Studio Blueprint tab. Builds `BASE_CHECKLIST` from `BLUEPRINT_SECTION_TITLES`, wires Copilot analysis into the checklist chips, gates the `Proceed to Build` button on readiness score + state items, and decides when the “Request pricing” (Ready for Pricing) CTA shows up (`showSendForPricing`). Also keeps local blueprint state, step canvas interactions, and surfaces Copilot errors.

2. `/components/automations/StudioChat.tsx`  
   Client chat pane. Streams the automation-version thread, submits user prompts, calls `/api/automation-versions/:id/copilot/reply`, and forwards `blueprintUpdates` + `analysis` back to the page. Also owns the UX for “analysis steps” (suggested next questions) shown while Copilot thinks.

3. `/components/automations/CopilotReadinessCard.tsx`  
   Presentational card (currently unused on the page) that renders readiness score, confident section count, and up to six todo items from the Copilot analysis snapshot—this is where next-step todos would show once wired.

4. `/lib/blueprint/types.ts`  
   Canonical source for the eight blueprint sections (keys, titles, ordering). Every checklist-related surface references this constant to stay in sync with backend expectations.

5. `/lib/blueprint/completion.ts`  
   Computes completion scoring for a blueprint: weights sections (45%), summary (10%), trigger/action presence (40% combined), and step depth (5%) to derive `score` plus per-section booleans. Used by the UI toast + any downstream readiness heuristics.

6. `/lib/blueprint/copilot-analysis.ts`  
   Defines the Copilot analysis schema: section snapshots (text, confidence, missing info), todos, human touchpoints, and readiness metadata (`score`, `stateItemsSatisfied`, `blockingTodos`). Also provides helpers for empty snapshots and for summarizing analyses when prompting the LLM.

7. `/lib/ai/copilot-orchestrator.ts`  
   The multi-pass LLM orchestrator. Normalizes blueprint updates, merges section summaries, recomputes readiness/todos, runs a validator, and picks the single “next best question.” Contains `SECTION_DEFAULT_PROMPTS`, todo/category prioritization, and dedup logic (`shouldAskQuestion`, `askedQuestions`, tag tracking) to avoid repeating requirements questions. Also enforces stage-specific question filters and emits `thinkingSteps`.

8. `/app/api/automation-versions/[id]/copilot/reply/route.ts`  
   API surface the chat calls. Loads history + blueprint, invokes `runCopilotOrchestration`, persists the assistant reply, and returns `analysis`, `thinkingSteps`, and `blueprintUpdates`. This is the bridge between StudioChat and all requirement/checklist data.

9. `/app/api/automation-versions/[id]/copilot/draft-blueprint/route.ts`  
   Initial blueprint drafting endpoint. Seeds each section via `buildSectionCopy()` (with explicit `business_requirements` copy), infers systems, and produces default steps so the canvas + checklist chips have baseline content even before Copilot refinements.

10. `/lib/ai/prompts.ts`  
    System prompt builder for Copilot. Hard-codes that the assistant must capture requirements, stay within the eight sections, and always reply with `blueprint_updates` JSON plus at most one clarifying requirement question. This is the root of all LLM behavior around requirements.

---

## Problematic Logic Areas (where to look)

| Area | Primary files | Notes |
| --- | --- | --- |
| Requirements/checklist population | `/app/(studio)/automations/[automationId]/page.tsx`, `/lib/blueprint/types.ts`, `/lib/ai/copilot-orchestrator.ts`, `/app/api/automation-versions/[id]/copilot/draft-blueprint/route.ts` | UI builds chips from constants, backend populates section summaries + missing info, draft route seeds placeholder requirements. |
| Completion scoring | `/lib/blueprint/completion.ts` | All section weighting + thresholds (160 chars per section, 60-char summary) live here. |
| Suggested next questions / steps | `/lib/ai/copilot-orchestrator.ts`, `/components/automations/StudioChat.tsx` | Orchestrator picks the single question via todo/section/fallback priority; StudioChat renders the “analysis steps” spinner using returned thinking steps. |
| “Ready for Pricing” enablement | `/app/(studio)/automations/[automationId]/page.tsx` (`showSendForPricing`, `StatusStepper`) | CTA only appears when version status ∈ {`IntakeInProgress`,`NeedsPricing`} and there’s no quote. |
| Deduping repeated questions | `/lib/ai/copilot-orchestrator.ts` (`shouldAskQuestion`, `normalizeQuestionText`, `extractQuestionTags`) | Tracks normalized questions + semantic tags to suppress repeats when the user didn’t answer. |
| Requirements-focused LLM prompting | `/lib/ai/prompts.ts`, `/lib/ai/copilot-orchestrator.ts` (PASS instructions + `SECTION_DEFAULT_PROMPTS`) | Governs the wording the model sees when we ask it to fill requirements/checklists. |

---

## UI Data Flow Reference

- **Checklist chips**  
  `app/(studio)/automations/[automationId]/page.tsx` memoizes `analysisSectionCompletion` from the latest `copilotAnalysis` snapshot delivered by `StudioChat`. Each chip flips to “complete” when its section has non-empty `textSummary` and confidence above `low`; the Flow Complete chip additionally checks readiness score ≥ 70 or `readiness.stateItemsSatisfied` containing `"flow_complete"`.

- **Suggested next questions / next steps**  
  `StudioChat` calls `/api/automation-versions/:id/copilot/reply` and receives `assistantDisplayText` (the deduped question from `lib/ai/copilot-orchestrator.ts`) plus optional `thinkingSteps`. Those steps drive the “Map flow & core requirements → …” progress list while Copilot thinks. Separate next-step todos live in `copilotAnalysis.todos` and would display via `CopilotReadinessCard` once mounted.

- **Buttons (“Proceed to Build” & “Request pricing”)**  
  - `Proceed to Build` (inside the Flow Complete chip) reads `copilotAnalysis.readiness.score`, `copilotAnalysis.readiness.stateItemsSatisfied`, current automation status, and async flags (`analysisLoading`, `proceedingToBuild`) before enabling.  
  - `Request pricing` comes from `StatusStepper`: `showSendForPricing` is true only when the selected version status is `IntakeInProgress` or `NeedsPricing` **and** `latestQuote` is null; the button simply patches the version status to `NeedsPricing`.

---

## Key Takeaways

- Every checklist/requirements UX ultimately flows through `copilotAnalysis`, which is owned by `lib/ai/copilot-orchestrator.ts` and surfaced via `/app/api/automation-versions/[id]/copilot/reply/route.ts`.
- Completion math and readiness gating are centralized (`/lib/blueprint/completion.ts` & orchestrator validator), so any UI tweaks should read from those helpers instead of duplicating thresholds.
- To adjust question cadence or deduping, concentrate on `shouldAskQuestion` and the todo/section prioritizers in the orchestrator—StudioChat simply renders whatever text the backend picks.

