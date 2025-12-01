# WRK Copilot – Project Overview

## Table of Contents

1. [Problem & Solution](#problem--solution)
2. [What is WRK Copilot?](#what-is-wrk-copilot)
3. [WRK Platform vs WRK Copilot](#wrk-platform-vs-wrk-copilot)
4. [Core Entities](#core-entities)
5. [Target Users](#target-users)
6. [Product Surfaces](#product-surfaces)
7. [Automation Lifecycle](#automation-lifecycle)
8. [AI Capabilities](#ai-capabilities)
9. [Key Use Cases](#key-use-cases)
10. [Competitive Differentiation](#competitive-differentiation)
11. [Future Capabilities](#future-capabilities)

---

## Problem & Solution

### The Problem

Businesses want automation but run into three consistent walls:

1. **Technical Complexity** – Real automations need APIs, integration glue, error handling, observability. Ops teams generally don’t have that skillset or bandwidth.
2. **Requirements Misalignment** – Requirements live in docs, emails, and calls. Builders interpret; clients feel misunderstood. Scope creep and mismatched expectations are the default.
3. **Opaque Process** – Pricing, build status, and run metrics sit in spreadsheets, tickets, and ad-hoc dashboards. There’s no single place to see “what’s live, what it costs, and what’s next”.

### The Solution

WRK Copilot is a collaborative automation design and orchestration layer that sits on top of the WRK Platform. It:

- **Captures Requirements Collaboratively** – Chat + structured intake + blueprint canvas instead of Word docs and screenshots.
- **Surfaces Transparent Pricing** – Setup fees, per-unit costs, and volume assumptions are part of the lifecycle, not a separate spreadsheet.
- **Gives Full Visibility** – Build status, checklists, run metrics, and ROI live in one place.
- **Keeps Execution Managed** – WRK’s team builds and runs the automation; the client describes, reviews, and approves.

Short version: “Describe your process, we build and run it for you.”

Architecturally:

- WRK Copilot = multi-tenant orchestration + UX layer.
- WRK Platform = workflow runtime and integration engine.

---

## What is WRK Copilot?

WRK Copilot is a multi-tenant SaaS app that manages the full lifecycle of business process automations:

`Requirements → Blueprint → Pricing → Build → Deploy → Monitor → Iterate`

Think of it as:

- Figma for workflows (visual, collaborative design),
- crossed with GitHub/Vercel for automations (clear pipeline, deploys, and observability),
- tuned specifically for business processes rather than raw dev workflows.

It’s built around a strict backend state machine and a set of 35 documented flows that cover identity, lifecycle, pricing, build, execution, collaboration, and ops.

---

## WRK Platform vs WRK Copilot

### WRK Platform (wrk.com)

The execution engine:

- Runs workflows (orchestration, retries, error handling).
- Connects to systems (CRMs, ERPs, email, storage, APIs, RPA, etc.).
- Exposes webhooks and APIs for triggers and result callbacks.
- Emits run events and usage metrics.

### WRK Copilot

The design + orchestration + management layer:

- Captures requirements and turns them into blueprints.
- Manages pricing, quotes, signatures, and billing readiness.
- Orchestrates the build pipeline and creates workflows in WRK Platform.
- Surfaces dashboards, usage, and ROI to clients.
- Gives ops a single pane of glass for all client projects.

### Relationship

- Copilot designs and orchestrates.
- Platform executes.
- Platform usage and events flow back into Copilot for monitoring, billing, and next-steps.

---

## Core Entities

### Automations & Versions

- **Automation** – A logical workflow, e.g. “Invoice Processing”, “Lead Routing”.
- **Automation Version** – A concrete version (v1.0, v1.1, v2.0) with:
  - Status (Intake → Needs Pricing → Build → QA → Ready to Launch → Live → Blocked/Archived)
  - Blueprint JSON (nodes/edges)
  - Intake progress (% completeness)

### Projects (Ops View)

- **Project** – Ops-facing wrapper around automation work, usually 1:1 with an automation version.
  - Type: `new_automation` or `revision`
  - Pricing status: `Not Generated → Draft → Sent → Signed`
  - Checklist progress: build/QA tasks completion

### Clients & Tenants

- **Tenant** – The actual workspace (auth + multi-tenant boundary).
- **Client** – Ops/commercial lens on a tenant with:
  - Health status (Good / At Risk / Churn Risk)
  - Spend + utilization
  - Account/ops owner

_1:1: each client maps to exactly one tenant._

### Quotes & Pricing

- **Quote** – Pricing artifact with setup fee, per-unit price, volume assumptions, tiers; status `draft → sent → signed → rejected`.
- **Pricing Override** – Admin-only mechanism to override pricing rules for special cases (discounts, promos, bespoke deals).

### Execution & Usage

- **Workflow Binding** – Maps an automation version to a specific WRK Platform workflow (by `workflow_id`).
- **Run Event** – A single execution (success/failure, error, timings).
- **Usage Aggregate** – Hourly/daily summary metrics used for billing, alerts, and reporting.

### Collaboration

- **Messages** – Threaded conversation scoped to a project or automation with types `client`, `ops`, `internal_note`, `system`.
- **Tasks** – Structured work items (context: project, automation_version, client, or internal; kind: `build_checklist`, `credentials_issue`, `general_todo`, etc.) used for build checklists, credential fixes, retention follow-up, etc.

---

## Target Users

### Studio Users (Client-Facing)

- **Who**: Ops leaders, RevOps, Sales Ops, Finance/Accounting, HR/People Ops, CS/Ops.
- **Patterns**:
  - Know their processes deeply.
  - Don’t want to become Zapier/Workato engineers.
  - Care about time-to-value, visibility, and ROI—not which API is being called.

### Admin/Ops Users (Internal)

- **Who**: Solutions engineers, automation builders, ops managers, account managers, internal operations.
- **Patterns**:
  - Manage multiple clients and a pipeline of automations.
  - Need structure: status, tasks, checklists, SLAs.
  - Need control: pricing overrides, client health, archiving, risk flags.

---

## Product Surfaces

### Studio Interface (Client-Facing)

| Surface | Description | Route |
| --- | --- | --- |
| Automations Dashboard | Grid/list view of automations with status, key stats, search & filters | `/automations` |
| Automation Detail | Overview, build status, blueprint canvas, test tools, activity stream, settings | `/automations/[id]` |
| Blueprint Canvas | Interactive visual workflow editor (nodes/edges) + AI-assisted intake | Tab within detail |
| Usage Metrics | Execution counts, success rate, cost, ROI | Tab within detail |
| Version History | Compare and roll back versions | Tab within detail |

### Admin Console (Ops-Facing)

| Surface | Description | Route |
| --- | --- | --- |
| Clients List | Table of clients with spend, utilization, health, projects, owner | `/admin/clients` |
| Client Detail | Overview, projects, quotes, spend summary, activity | `/admin/clients/[id]` |
| Projects List | Table/Kanban of projects by status/type/owner | `/admin/projects` |
| Project Detail | Blueprint, pricing, quote, build tasks, messages, activity | `/admin/projects/[id]` |
| Build Pipeline | Kanban board (Build in Progress, QA, Ready to Launch, etc.) | `/admin/projects` (Kanban view) |
| Pricing Overrides | Admin controls for override scenarios | Project detail tab |

---

## Automation Lifecycle

### End-to-End Flow

1. **Requirements Capture**
   - Client describes process in natural language.
   - Optional: upload docs, screenshots, recordings.
   - AI extracts early sketch of systems, triggers, and actions (V1: basic).
   - Interactive intake drives clarifying questions.
   - Status: `Intake in Progress`.

2. **Blueprint Design**
   - System generates a draft visual blueprint.
   - Client + WRK collaborate to refine nodes/edges, branches, error paths.
   - Once agreed, version moves to pricing.
   - Status: `Intake in Progress → Needs Pricing`.

3. **Pricing & Quote**
   - System calculates setup + unit price + expected volume.
   - Ops can adjust via controlled overrides.
   - Quote is sent; client views, comments, and signs.
   - Quote: `draft → sent → signed/rejected`.
   - Version: `Needs Pricing → Awaiting Client Approval`.

4. **Build & Deploy**
   - WRK team builds the automation in WRK Platform (v1: manual; future: assisted by agents).
   - Integrations, error handling, monitoring configured.
   - Client sees build checklist and progress in Copilot.
   - Status: `Awaiting Client Approval → Build in Progress → QA & Testing → Ready to Launch`.

5. **Live Execution**
   - Ops deploys to production (manual in v1 via Flow 24).
   - WRK Platform runs workflows based on triggers (webhooks, schedules, events).
   - Usage data flows back into Copilot.
   - Status: `Ready to Launch → Live`. Separately, `Paused` (client-driven) and `Blocked` (system/ops-driven) can apply.

6. **Iterate & Improve**
   - Client requests changes → new version (v1.0 → v1.1).
   - New version runs through the same lifecycle.
   - Old version is archived when the new one is live.
   - Status transitions: `Live (old) → Archived`.

### Core Statuses (Automation Version)

`Intake in Progress • Needs Pricing • Awaiting Client Approval • Build in Progress • QA & Testing • Ready to Launch • Live • Paused • Blocked • Archived`

Quote and pricing statuses live at project/quote level and are covered by the Pricing & Billing flows.

---

## AI Capabilities

### V1 (Already in Scope)

- **Requirements Extraction** – Pull out systems, triggers, actions, and data from freeform descriptions + docs.
- **Draft Blueprint Generation** – Generate a first-pass blueprint JSON (nodes, edges) from requirements.
- **Intake Progress Tracking** – Update completion % as required fields and clarifications are collected.

_Human review is required; AI is assistive, not fully autonomous._

### Future (Planned)

- **From Recording to Blueprint** – Take screen/video sessions and generate a structured workflow.
- **Optimization Suggestions** – Use run data to propose cost savings and performance tweaks.
- **Self-Healing** – Detect recurring failures and propose remediation steps (or auto-rollout gated fixes).
- **Natural Language Analytics** – “Which automations saved us the most this quarter?” / “Which workflows are error-prone?”

---

## Key Use Cases

Concrete automations where Copilot + Platform shine:

### Lead Routing & Enrichment

- Multi-source lead ingestion (forms, ads, events).
- Enrichment (Clearbit, ZoomInfo, internal data).
- Territory/owner assignment and notifications.
- Metrics: time-to-first-touch, lead SLA, conversion rates.

### Customer Onboarding

- Account provisioning across CRM, billing, support, email, product.
- Tier-based workflows (Standard, Pro, Enterprise).
- Tasking and notifications for manual steps.
- Metrics: time-to-activation, onboarding drop-offs.

### Invoice Processing

- Ingest invoices from email/storage.
- OCR + data extraction.
- Match against POs; flag exceptions.
- Post to accounting systems; notify finance.
- Metrics: processing time, exception rate, cost per invoice.

### Property Management Automation

- Maintenance request intake (portal, email, SMS).
- Vendor matching and dispatch.
- Scheduling, follow-ups, status updates.
- Metrics: time-to-response, time-to-resolution, vendor performance.

---

## Competitive Differentiation

### “Done-For-You”, Not “Learn-a-Tool”

- No-code platforms expect users to become builders.
- WRK Copilot expects users to describe processes and review outcomes.
- Implementation handled by WRK (plus future AI agents), not the end user.

### Collaborative Design vs Document Dumps

- Typical: requirements in docs + email → misalignment.
- Copilot: in-app intake, chat, and blueprint canvas, so both sides see the same workflow.

### Pricing + Build + Monitoring in One Place

- Typical: quotes in spreadsheets, builds in Jira, metrics scattered.
- Copilot: all tied to the same automation versions and projects, with proper state machine and audit logs.

### Enterprise-Grade Under the Hood

- Strict tenant isolation and audit logging for every meaningful change.
- API-first backend; multi-tenant Neon + modular monolith + workers.
- Workers, webhooks, and idempotency built into the design.

---

## Future Capabilities

### Automation AI Agents

- Help transform raw inputs (recordings, logs) into structured workflows.
- Proactively tune automations based on observed patterns.
- Suggest replacements/upgrades when upstream systems change.

### Deeper WRK Platform Integration

- More granular real-time monitoring and circuit breakers.
- Stronger cost optimization recommendations based on usage patterns.
- Marketplace of pre-built automations with customization via Copilot.

### Partner & API Ecosystem

- Embeddable surfaces for partners to expose automation design and tracking.
- Public APIs for building custom dashboards and controls.
- White-label options for partners/resellers.

### Advanced Collaboration

- Real-time co-editing of blueprints.
- Multi-step approval workflows for pricing, deployments, major changes.
- Team-focused lenses (per-region, per-BU, per-owner).

---

## How This Ties to the Detailed Flows

This overview defines what WRK Copilot is trying to do and for whom.

The 35 flows in `project_details/user_flows/` define exactly how the backend behaves:

- Identity & access, tenants/workspaces, API keys.
- Automation and project lifecycle (status state machine).
- Pricing, quotes, billing, and overrides.
- Build, deploy, pause/resume, credential failures, and blocking.
- Messaging, tasks, and client health.
- Archiving and admin/ops workflows.

Backend and frontend work should always be anchored to those flows. If a behavior isn’t expressed there, it’s either out of scope or needs a flow update.
