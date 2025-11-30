# WRK Copilot Project Overview

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

Businesses need automation but face three barriers:

1. **Technical Complexity**: Building automations requires coding, API knowledge, and integration expertise that operations teams lack.
2. **Requirements Misalignment**: Document/email-based requirement gathering leads to miscommunication and mismatched expectations.
3. **Opaque Process**: Pricing, build status, and metrics scattered across spreadsheets and tools—no single source of truth.

### The Solution

WRK Copilot is a collaborative automation design and orchestration platform that bridges the gap between business requirements and technical execution. It provides:

- **Collaborative Design**: Visual blueprint editor where clients and builders align on workflow design before implementation.
- **Transparent Pricing**: Integrated quotes with setup fees, per-unit costs, and volume estimates visible throughout the lifecycle.
- **Full Visibility**: Real-time build progress, execution metrics, and ROI tracking in one platform.
- **Managed Execution**: WRK team handles technical implementation; clients focus on describing processes and reviewing results.

**Value Proposition**: "Describe your process, we build and run it for you."

**Architecture**: Multi-tenant, API-first backend with two interfaces:
- **Studio**: Client-facing automation management
- **Admin Console**: Internal ops pipeline management

---

## What is WRK Copilot?

WRK Copilot is a multi-tenant SaaS platform that manages the complete lifecycle of business process automations—from requirements capture through blueprint design, pricing, build orchestration, and execution monitoring.

**Analogy**: Think "Figma for workflows" combined with the build pipeline visibility of GitHub and Vercel, but specifically designed for business process automation.

**Core Workflow**: Requirements → Blueprint → Pricing → Build → Deploy → Monitor → Iterate

---

## WRK Platform vs WRK Copilot

**WRK Platform** (Wrk.com): The execution engine that runs workflows. It provides:
- Workflow runtime and execution infrastructure
- System integrations (CRM, email, databases, APIs)
- Execution monitoring and error handling
- Webhook APIs for triggering workflows and receiving run events

**WRK Copilot**: The design, orchestration, and management layer built on top of WRK Platform. It provides:
- Requirements capture and blueprint design
- Pricing and quote management
- Build orchestration (creates workflows in WRK Platform)
- Client-facing dashboards and metrics
- Ops pipeline management

**Relationship**: WRK Copilot designs and orchestrates; WRK Platform executes. Execution events flow back to WRK Copilot for monitoring and billing.

---

## Core Entities

### Automations & Versions

- **Automation**: Logical workflow (e.g., "Invoice Processing"). One automation has many versions.
- **Automation Version**: Specific version (v1.0, v1.1, v2.0) with status, blueprint JSON (nodes/edges), and intake progress (0-100%).

### Projects (Ops View)

- **Project**: Ops-facing automation work (often 1:1 with automation versions). Type: `new_automation` or `revision`. Pricing status: `Not Generated` → `Draft` → `Sent` → `Signed`. Checklist progress tracks build task completion.

### Clients & Tenants

- **Tenant**: Organization/workspace (auth source of truth)
- **Client**: Ops-facing tenant view with commercial metadata (health, spend, ops owner). 1:1 with tenant.

### Quotes & Pricing

- **Quote**: Pricing proposal (status: `draft` → `sent` → `signed` → `rejected`). Components: setup fee, per-unit price, estimated volume, effective unit price.
- **Pricing Override**: Admin override for special cases.

### Execution & Usage

- **Workflow Binding**: Links automation version to WRK Platform workflow
- **Run Event**: Individual execution (success/failure, timing, errors)
- **Usage Aggregate**: Pre-aggregated metrics (hourly/daily) for billing

### Collaboration

- **Messages**: Threaded communication. Type: `client` (visible to client), `ops` (ops only), `internal_note` (ops-only).
- **Tasks**: Unified tasks (build checklist, TODOs, workflow items). Context: `project`, `automation_version`, or `internal`. Kind: `build_checklist`, `general_todo`, `workflow_item`.

---

## Target Users

### Studio Users (Client-Facing)

**Personas**: Operations leaders (SMBs/mid-market), RevOps/Sales Ops, Finance/Accounting, HR/People Ops, Customer Success.

**Characteristics**: Deep process knowledge, limited technical skills, value collaboration/transparency, need ROI visibility.

### Admin/Ops Users (Internal)

**Personas**: Solutions engineers, operations managers, account managers, internal operations.

**Characteristics**: Technical expertise, manage multiple clients/projects, require efficiency tools.

---

## Product Surfaces

### Studio Interface (Client-Facing)

| Feature | Description | Route |
|---------|-------------|-------|
| **Automations Dashboard** | Grid/list view, filters by status, search, quick stats | `/automations` |
| **Automation Detail** | Overview, build status, blueprint canvas, test, activity, settings | `/automations/[id]` |
| **Blueprint Canvas** | Interactive visual workflow editor (nodes/edges), AI chat | Tab within detail |
| **Usage Metrics** | Execution counts, success rates, ROI, cost per execution | Tab within detail |
| **Version History** | View and rollback to previous versions | Tab within detail |

**Capabilities**: Real-time status, collaborative blueprint editing, AI suggestions (V1: basic), usage/ROI metrics, version management.

### Admin Console (Ops-Facing)

| Feature | Description | Route |
|---------|-------------|-------|
| **Clients List** | Table view: spend, utilization, health, projects, owner | `/admin/clients` |
| **Client Detail** | Overview, projects, quotes, activity, spend summary | `/admin/clients/[id]` |
| **Projects List** | Kanban/table view, filter by client/status/type/owner | `/admin/projects` |
| **Project Detail** | Overview, blueprint, pricing/quote, build tasks, activity, chat | `/admin/projects/[id]` |
| **Pricing Overrides** | Admin override panel for setup fee and unit price | Tab within project detail |
| **Build Pipeline** | Kanban view with drag-and-drop status updates | `/admin/projects` (Kanban) |

**Capabilities**: Pipeline management (Kanban), pricing overrides, build tracking, client communication, spend/utilization monitoring.

---

## Automation Lifecycle

### End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. REQUIREMENTS CAPTURE                                          │
│    • Client describes process (natural language)                  │
│    • Optional: Upload docs, screenshots, recordings            │
│    • AI extracts workflow elements (V1: basic, Future: advanced)│
│    • Interactive UI guides clarifying questions                  │
│    Status: "Intake in Progress"                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. BLUEPRINT DESIGN                                              │
│    • Platform generates visual workflow blueprint                │
│    • Client and WRK team collaborate in real-time               │
│    • Iterate until blueprint approved                           │
│    • Blueprint: nodes (steps) + edges (connections)             │
│    Status: "Intake in Progress" → "Needs Pricing"               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. PRICING & QUOTE                                               │
│    • System calculates: setup fee + per-unit price              │
│    • WRK team generates quote (with optional overrides)         │
│    • Client reviews and signs quote                             │
│    Quote Status: "Draft" → "Sent" → "Signed"                    │
│    Version Status: "Needs Pricing" → "Awaiting Client Approval" │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. BUILD & DEPLOY                                               │
│    • WRK team builds automation (V1: manual, Future: AI agents)│
│    • Creates workflow in WRK Platform                           │
│    • Configures integrations, error handling, monitoring        │
│    • Client sees real-time build progress (checklist, ETA)      │
│    Status: "Awaiting Client Approval" → "Build in Progress"    │
│    → "QA & Testing" → "Ready to Launch"                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. LIVE EXECUTION                                                │
│    • Automation deployed to production                          │
│    • WRK Platform executes workflows based on triggers         │
│    • Run events sent to WRK Copilot via webhooks                │
│    • Client monitors: usage, success rate, ROI, costs          │
│    Status: "Ready to Launch" → "Live"                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. ITERATE & IMPROVE                                             │
│    • Client requests changes → new version (v1.0 → v1.1)        │
│    • New version goes through same lifecycle                    │
│    • Old version remains live until new version deployed       │
│    • Platform suggests optimizations (Future: AI-powered)       │
│    Status: "Live" → (new version) → "Archived" (old version)    │
└─────────────────────────────────────────────────────────────────┘
```

### Status Transitions

**Automation Version Statuses** (in order):
1. `Intake in Progress` - Requirements being captured
2. `Needs Pricing` - Blueprint complete, pricing needed
3. `Awaiting Client Approval` - Quote sent, waiting for client sign-off
4. `Build in Progress` - WRK team building automation
5. `QA & Testing` - Automation tested in staging
6. `Ready to Launch` - Approved for production deployment
7. `Live` - Running in production
8. `Blocked` - Paused due to issues (can occur at any stage)
9. `Archived` - Superseded by newer version or cancelled

**Quote Statuses**:
- `draft` - Initial quote created
- `sent` - Quote sent to client
- `signed` - Client approved quote
- `rejected` - Client rejected quote

**Pricing Status** (Project-level):
- `Not Generated` - No quote yet
- `Draft` - Quote in draft
- `Sent` - Quote sent to client
- `Signed` - Quote signed by client

---

## AI Capabilities

### V1 (Foundational)

- **Basic Requirements Extraction**: Extract workflow elements (systems, triggers, actions) from documents and descriptions
- **Draft Blueprint Generation**: Generate initial blueprint JSON (nodes/edges) from requirements
- **Intake Progress Tracking**: Update progress percentage as requirements are captured

**Limitation**: V1 AI assists but requires human review. Blueprints not production-ready without WRK team validation.

### Future Enhancements

- **Advanced Blueprint Generation**: Turn recordings (screen/video) into draft blueprints automatically
- **Optimization Suggestions**: Analyze usage patterns, suggest cost/performance optimizations
- **Self-Healing**: Detect failures and automatically propose/apply fixes
- **Intelligent Routing**: Suggest workflow improvements from execution patterns
- **Natural Language Queries**: "Show automations processing >1000 items/month"

---

## Key Use Cases

### Lead Routing & Enrichment

**Scenario**: Sales team receives leads from multiple sources, needs automatic enrichment and territory-based assignment.

**Flow**: Requirements → Blueprint (lead sources → enrichment → routing → notifications) → Pricing → Build → Monitor (leads processed, assignments, response times)

### Customer Onboarding

**Scenario**: SaaS company needs automatic account provisioning across CRM, billing, support, email marketing for different subscription tiers.

**Flow**: Upload docs → AI extraction (V1: basic) → Blueprint refinement → Build (multi-system, tier-based) → Monitor (completion rates, bottlenecks)

### Invoice Processing

**Scenario**: Finance team processes hundreds of PDF invoices daily: extract data, validate against POs, sync to accounting software, flag exceptions.

**Flow**: Requirements → Blueprint (email → OCR → validation → sync → exceptions) → Pricing (volume-based) → Build (OCR, validation) → Monitor (volume, accuracy, cost)

### Property Management Automation

**Scenario**: Property management company automates maintenance requests: intake → vendor matching → scheduling → status updates.

**Flow**: Requirements → Blueprint (intake → vendor matching → scheduling → updates) → Pricing → Build (vendor DB, scheduling) → Monitor (resolution time, vendor performance)

---

## Competitive Differentiation

### "We Do It For You" vs Pure Self-Serve

**Traditional No-Code**: Users become tool experts, configure workflows, debug errors, maintain automations.

**WRK Copilot**: WRK team handles implementation. Clients describe and review. No need to become automation engineers.

### Collaborative Design vs Document-Based Requirements

**Traditional**: Requirements in documents/emails/meetings → miscommunication → mismatched expectations.

**WRK Copilot**: Collaborative in-platform capture. Visual blueprint = shared understanding. Clients see exactly what will be built.

### Integrated Pricing & Build Tracking vs Scattered Tools

**Traditional**: Pricing in spreadsheets, build status in PM tools → no single source of truth.

**WRK Copilot**: Integrated transparent pricing and real-time build progress. Like GitHub + Vercel for business processes.

### Enterprise-Grade Architecture

**Multi-Tenant Security**: Complete data isolation, tenant-scoped queries, audit logging. **API-First**: REST APIs for partners and custom dashboards. **Scalable**: Queue-based async processing, connection pooling, high concurrency. **Reliable**: Workers with retries and error handling.

---

## Future Capabilities

### AI Agents for Automation

- **Draft Blueprint from Recordings**: Turn recordings/video into draft blueprints automatically
- **Optimization Suggestions**: "10,000 invoices/month → batching reduces costs 30%"
- **Self-Healing**: Detect failures and automatically propose/apply fixes

### Deeper WRK Platform Integration

- **Real-Time Monitoring**: Advanced error handling and performance optimization
- **Workflow Marketplace**: Pre-built customizable templates
- **Cost Optimization**: Dynamic pricing from WRK Platform usage patterns

### Partner & API Ecosystem

- **Embedded Workflows**: Partners embed design/management via APIs
- **Webhook Integrations**: External systems trigger automations, receive completion webhooks
- **Public API**: Full REST API for programmatic access, custom dashboards, white-label

### Advanced Collaboration

- **Real-Time Co-Editing**: Multiple users edit blueprints simultaneously (Google Docs-style)
- **Approval Workflows**: Built-in flows for blueprint changes, pricing, deployments
- **Team Workspaces**: Role-based permissions, team-specific views

---

## Conclusion

WRK Copilot makes automation accessible to non-technical teams while providing the power, transparency, and control technical teams expect. Collaborative design, transparent pricing, build visibility, and enterprise-grade architecture bridge the gap between "I need automation" and "I have automation running."

Scales from a client's first automation to hundreds across their organization, with full visibility into usage, ROI, and performance at every stage.
