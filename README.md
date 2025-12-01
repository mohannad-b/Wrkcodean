# WRK Copilot

WRK Copilot is a web app that helps businesses describe and manage automated workflows (automations) in a guided, collaborative way. It gives clients a “studio” experience for capturing requirements and tracking build progress, and gives ops a set of admin tools tied to a strict backend state machine and 35 documented flows.

## Project Structure

This project has been refactored from an early design export into a clean Next.js 14 App Router project.

### Architecture

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **UI Components**: shadcn-style components on top of Radix UI primitives
- **Deployment**: Optimized for Vercel (Next.js build output, edge-friendly where possible)

### Directory Structure

Top-level layout:

- `app/` – Next.js App Router entrypoint
- `app/(studio)/` – Studio-side routes (client-facing)
  - `automations/` – Automation listing and detail views
- `app/(admin)/` – Admin-side routes (internal ops)
  - `projects/` – Projects dashboard and admin views
- `app/(settings)/` – Workspace and user settings
- `app/layout.tsx` – Root layout with AppShell
- `app/page.tsx` – Home page (typically redirects to `/automations`)
- `app/globals.css` – Global styles (Tailwind base + design tokens)
- `components/`
  - `components/layout/`
    - `AppShell.tsx` – Main app shell (layouts, chrome, nav)
    - `Sidebar.tsx` – Navigation sidebar
  - `components/ui/` – Reusable UI components (PageHeader, StatCard, SectionCard, StatusBadge, AutomationCard, AutomationGrid, shadcn-style building blocks)
  - `components/brand/`
    - `WrkLogo.tsx` – Brand/logo component
- `lib/`
  - `lib/types.ts` – Shared TypeScript types
  - `lib/mock-automations.ts` – Mock data for development
  - `lib/utils.ts` – Utility functions
- Config files: `next.config.mjs`, `tailwind.config.cjs`, `postcss.config.cjs`, `tsconfig.json`, etc.

### Key Features

#### Studio Side (Client-Facing)

**Automations Dashboard** (`/automations`)
- List all automations for the current workspace with status, basic metrics, and key metadata.
- Create new automations (kicks off Flow 8/9 path on the backend).
- Filter and search automations by status, owner, tags, etc.

**Automation Detail** (`/automations/[id]`)
- Three-panel layout:
  - Left panel: Chat-style requirements intake and collaboration thread.
  - Center panel: Blueprint / process map canvas for the automation.
  - Right panel: Step details, status, and contextual metadata (versions, pricing, tasks, etc.).
- Intent is to feel like a “brief + builder” workspace tied directly into the backend state machine and flows (Create Automation, Needs Pricing, Build, QA, Live, Paused, Blocked, Archived).

#### Admin Side (Internal)

**Projects Dashboard** (`/admin/projects`)
- Internal view of client projects and automations.
- Shows build/QA/deploy status, pricing state, key dates, and health.
- Entry point for ops to trigger flows like Request Build, QA approval, Deploy to Production, Pause/Resume, Archive, etc.

Additional admin views can hang off this tree for:
- Client health status and retention (Flows 33–35).
- Task queues and credential issues (Flows 25, 26, 31, 32).
- Usage/alerts dashboards (Flow 28 surface).

#### Settings

**Workspace Settings** (`/settings`)
- Configure workspace (tenant) preferences.
- Manage workspace identity (name, branding, subdomain) once backend is wired.
- User account/profile settings and (eventually) auth-related preferences.

## Development

### Prerequisites
- Node.js 18+
- pnpm or npm

### Setup

1. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```
2. Create `.env.local` with your Neon connection string and Auth0 settings. Example:
   ```bash
   DATABASE_URL="postgres://user:password@host:5432/wrk_copilot"
   APP_BASE_URL="http://localhost:3000"
   AUTH0_DOMAIN="dev-1234.us.auth0.com"
   AUTH0_CLIENT_ID="..."
   AUTH0_CLIENT_SECRET="..."
   AUTH0_SECRET="<openssl rand -hex 32>"
   OPENAI_API_KEY="..."
   STORAGE_ACCESS_KEY="..."
   STORAGE_SECRET="..."
   DEFAULT_TENANT_ID="<acme tenant id from db:seed>"
   DEFAULT_TENANT_ROLE="client_admin"
   AUTH0_MOCK_ENABLED=false   # set to true only when bypassing Auth0 locally
   MOCK_TENANT_ID="<from seed output when using mock mode>"
   MOCK_USER_ID="<from seed output when using mock mode>"
   ```
3. Apply the schema (runs Drizzle migrations):
   ```bash
   npm run db:push
   ```
4. Seed the database with the default tenant/users (prints IDs to reuse in `.env.local`):
   ```bash
   npm run db:seed
   ```
   If you ever need to recreate the schema manually (e.g., new Neon database or Vercel preview), run the SQL in `scripts/bootstrap.sql` first, then re-run the seed.
5. Run the development server:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```
6. Open the app at http://localhost:3000 — unauthenticated users are redirected to `/auth/login` (Auth0). Use `/auth/logout` to sign out.

### Build & Run (Production)
- `npm run build`
- `npm start`
(or the pnpm equivalents).

## Deployment

The project is optimized for Vercel:
1. Push the repository to GitHub (or another git provider supported by Vercel).
2. Import the project in Vercel and point it at the main branch.
3. Vercel runs `npm install` and `npm run build` automatically and deploys.

Notes:
- Uses the Next.js App Router with server and client components where appropriate.
- Supports static generation, server-side rendering, and incremental features as you wire in backend APIs.
- Heavy components (e.g., canvas or large tables) should be lazy-loaded as needed.

## Mock Data

Right now the app uses mock data from `lib/mock-automations.ts`. This is a stub for frontend development. Once the backend is integrated, these mocks should be replaced with real API calls that implement the WRK Copilot backend flows and state machine (Flows 8–13, 21–26, 30–35, etc.).

## Project Documentation

Detailed documentation lives in the `project_details/` folder:
- **[Backend Architecture](project_details/BACKEND_ARCHITECTURE.md)** – Backend architecture, database schema, API design, and the flow/state machine contract.
- **[Frontend Architecture](project_details/FRONTEND_ARCHITECTURE.md)** – Frontend architecture, component structure, routing, and UI patterns.
- **[User Flows](project_details/user_flows/)** – Comprehensive documentation for all 35 flows, organized by category:
  - Identity & Access Flows
  - Automation Lifecycle Flows
  - Pricing & Billing Flows
  - Build & Deployment Flows
  - Execution & Monitoring Flows
  - Collaboration Flows
  - Admin & Ops Flows

Each flow is documented in its own file for clarity. The index and category links are in `project_details/user_flows/README.md`.

Execution & Monitoring highlights:
- Credentials management and blocking/unblocking (Flows 25, 26, plus tasks Flows 31–32).
- Optional run-event webhook from WRK Platform (Flow 27 – described, not required for v1).
- Usage sync and threshold alerts using summarized usage from WRK Platform (Flow 28).

## Next Steps

- Integrate backend API and wire the frontend to real endpoints (Neon + modular monolith as per BACKEND_ARCHITECTURE.md).
- Add authentication and workspace switching using the Identity & Access flows (1A/1B/2/3/6).
- Implement real-time features:
  - Chat/messages, system messages, and suggestions (Flow 30).
  - Live canvas updates and status changes across the app shell.
- Replace mock data with real automations, projects, tasks, and messages.
- Enhance admin dashboards with:
  - Task queues and build checklists (Flows 31–32).
  - Client health and retention workflows (Flows 33–34).
  - Archiving and lifecycle management (Flow 35).
