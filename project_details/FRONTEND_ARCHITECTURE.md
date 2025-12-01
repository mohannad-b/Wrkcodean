# WRK Copilot Front-End Architecture

## Overview

WRK Copilot’s front-end is a Next.js + TypeScript app exposing two main surfaces:

1. **Studio** – Client-facing interface for managing automations, dashboards, usage, and configuration.
2. **Admin** – Internal console for managing clients, projects, pricing, and the build pipeline.

The current build is front-end only (mock data), but structured to plug into the WRK Copilot backend with minimal refactor.

---

## Goals & Tech Stack

### High-Level Goals

- Reusable components across Studio and Admin.
- Type-safe development with strict TypeScript.
- Scalable routing via the Next.js App Router.
- Consistent design system (Tailwind + shadcn-style primitives).
- Backend-ready seams for API integration, auth, and multi-tenancy.

### Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **UI Primitives:** Radix UI + shadcn-style wrappers
- **Icons:** Lucide React
- **State:** React hooks (`useState`, `useMemo`, `useCallback`) – no global store yet
- **Testing:** Vitest + React Testing Library
- **Lint/Format:** ESLint + Prettier
- **Optional libs:** React Flow (canvas), Recharts (charts), Motion/Framer (animations)

### Project Structure

```
Wrkcodean/
├── app/                        # Next.js App Router routes
│   ├── (studio)/              # Studio (client-facing)
│   │   ├── automations/
│   │   ├── dashboard/
│   │   ├── messages/
│   │   ├── tasks/
│   │   ├── team/
│   │   ├── user-settings/
│   │   └── workspace-settings/
│   ├── (settings)/            # Settings group (future expansion)
│   ├── admin/
│   │   ├── clients/
│   │   └── projects/
│   ├── layout.tsx             # Root layout (AppShell)
│   ├── page.tsx               # Redirects to /automations
│   └── globals.css
├── components/
│   ├── layout/
│   ├── ui/
│   ├── automations/
│   ├── admin/
│   ├── modals/
│   ├── settings/
│   └── brand/
├── lib/
│   ├── types.ts
│   ├── utils.ts
│   ├── mock-*.ts
│   └── admin-mock.ts
├── tests/
│   ├── components/
│   ├── pages/
│   └── setupTests.ts
├── archive/                   # Figma-generated reference
└── public/
```

**Key conventions**

- `app/` handles routing and top-level layouts; logic lives in `components/`.
- `components/ui/` holds shadcn-style primitives and scaffolding.
- `components/{domain}/` stores domain-specific composites.
- `lib/mock-*.ts` is the current data source.

---

## Routing & Layout

### Route Model

- `/` → redirect to `/automations`
- `/automations` → Studio dashboard
- `/automations/[automationId]` → automation detail
- `/automations/new` → new automation flow
- `/dashboard` → Studio overview dashboard
- `/admin` → redirect to `/admin/clients`
- `/admin/clients`, `/admin/clients/[id]`
- `/admin/projects`, `/admin/projects/[id]`
- `/settings` → workspace/user settings

**Route groups**

- `(studio)` – all client-facing surfaces
- `(settings)` – settings-specific layout grouping
- `admin/` – separate namespace (no route group)

### Global Layout

- **Root layout (`app/layout.tsx`)** wraps the app in `<AppShell>` and applies global HTML/body, fonts, styles.
- **AppShell** provides the main frame (sidebar + content, theme background).
- **Sidebar**:
  - Handles Studio/Admin navigation.
  - Uses `usePathname()` for active state.
  - Responsive (collapsed on small screens, full on desktop).

### Page Pattern

```tsx
export default function SomePage() {
  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6 md:p-10 space-y-8">
        <PageHeader title="..." subtitle="..." actions={/* optional buttons */} />
        {/* Content */}
      </div>
    </div>
  );
}
```

Benefits: scrollable main area, centered content, consistent padding, standard header.

---

## UI Components & Design System

### Component Layers

1. **Layout (`components/layout/`)** – AppShell, Sidebar, layout helpers.
2. **UI Primitives (`components/ui/`)** – Buttons, inputs, dropdowns, badges, dialogs, PageHeader, SectionCard, StatCard, StatusBadge, AutomationCard/Grid.
3. **Domain components**:
   - **Automations:** StudioCanvas (React Flow), StudioChat, StudioInspector, tab containers.
   - **Admin:** SpendSummaryCard, PricingOverridePanel, ConversationThread, MessageComposer, resource overview cards.
   - **Settings:** Workspace/user settings cards and forms.

### Design Tokens & Styling

- **Colors:** primary `#E43632`, backgrounds `#F9FAFB` / `#F5F5F5`, text `#0A0A0A`/`#1A1A1A`, status palettes (emerald, amber, red, blue).
- **Typography:** Inter/Manrope/system stack; headings `text-2xl/3xl`, body `text-sm/base`.
- **Patterns:** Cards (`bg-white rounded-xl border border-gray-200 shadow-sm p-6`), primary button (`bg-[#0A0A0A] text-white`), pill badges.
- **Reuse:** Only add generic primitives to `components/ui/`; domain folders compose those primitives. Extract shared patterns (status chips, avatars, KPIs) when reused.

---

## State Management & Data Flow

### Mock-Data Phase

All pages read from `lib/mock-*.ts`. Example:

```tsx
import { mockAutomations } from "@/lib/mock-automations";

export default function AutomationsPage() {
  const [filter, setFilter] = useState<AutomationFilter>("all");

  const filtered = useMemo(
    () => mockAutomations.filter((a) => filter === "all" || a.status === filter),
    [filter]
  );

  return <AutomationGrid automations={filtered} />;
}
```

- Local state only (`useState`, `useMemo`).
- No Redux/Zustand/Context yet.
- Filters may later sync to URL via `useSearchParams`.

### Future Backend Integration

- Server Components fetch data via internal service modules.
- Client Components use SWR/React Query/simple fetch for incremental updates.
- Tenant/auth context likely lives in a small provider + Next middleware.

```tsx
import { getAutomations } from "@/lib/services/automations";

export default async function AutomationsPage() {
  const automations = await getAutomations();
  return <AutomationGrid automations={automations} />;
}
```

### Styling & Layout System

- Tailwind config includes content paths, theme variables, fonts.
- `app/globals.css` defines CSS variables (`--background`, `--foreground`), base typography, scrollbar styles.
- Layout patterns:
  - Container: `max-w-[1600px] mx-auto p-6 md:p-10`
  - Card: `bg-white rounded-xl border border-gray-200 shadow-sm p-6`
  - Grids: stats (`grid-cols-1 md:grid-cols-4`), content (`grid-cols-1 lg:grid-cols-3`)
- Guidelines: prefer Tailwind utilities, consistent spacing, shared primitives.

---

## Testing & Code Quality

### Testing Stack

- Vitest (JSDOM), React Testing Library, Jest-DOM (`tests/setupTests.ts`).
- Structure:

```
tests/
├── components/
│   ├── layout/AppShell.test.tsx
│   └── ui/StatusBadge.test.tsx
├── pages/
│   └── automations.test.tsx
└── setupTests.ts
```

**Coverage expectations**

- Layout: AppShell renders sidebar + content.
- UI primitives: StatusBadge maps statuses to colors/labels.
- Pages: `/automations` renders list, filters, navigates.
- New nav/Studio/Admin features need smoke + simple interaction tests.

**Scripts:** `npm run test`, `test:watch`, `test:coverage`.

### Linting/Formatting/Types

- ESLint (`next/core-web-vitals` + TS + Prettier)
- Prettier formatting
- TypeScript strict mode

**Scripts:** `npm run lint`, `lint:fix`, `format`, `format:check`, `type-check`.

**Standards:** path aliases (`@/...`), typed functional components, zero lint/type errors at commit time.

---

## Performance & Optimization

- Dynamic imports for heavy components (`StudioCanvas` with `dynamic(..., { ssr: false })`).
- Bundle splitting for React Flow, Recharts, Motion.
- React optimizations: `useMemo` for derived data, stable values defined outside components.

**Keep it fast:**

- Keep heavy libs behind dynamic imports.
- Avoid loading them inside layouts.
- Add pagination/virtualization when switching to real large datasets.
- Prefer server components for data fetching once backend is live.

---

## Security & Backend Contract

Currently no real auth (local mocks). Once connected:

### Auth & Tenant Scoping

- `tenantId`/`userId` must come from the server session (cookies/JWT) – never from client props, query params, or local storage.
- All Next.js API routes (`app/api/**`) must:
  1. Get session (`getSession()` or equivalent).
  2. Use `session.tenantId` for DB calls.
  3. Validate bodies with Zod (or similar).
  4. Enforce RBAC per route.

```tsx
import { getSession } from "@/lib/auth";
import { z } from "zod";

const CreateAutomationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const data = CreateAutomationSchema.parse(await req.json());

  const automation = await createAutomation({
    ...data,
    tenantId: session.tenantId,
    ownerId: session.userId,
  });

  return Response.json(automation);
}
```

### Front-End Safety

- Avoid `dangerouslySetInnerHTML` (sanitize first if needed).
- Share validation schemas with backend (Zod) for forms.

---

## Extending the Front-End

### New Studio Page

1. Add `app/(studio)/<slug>/page.tsx`.
2. Use the standard scaffold (flex-1, PageHeader, container).
3. Pull data from `lib/mock-*.ts`.
4. Wire into Sidebar if it’s a primary nav item.

### New Admin Page

1. Add `app/admin/<slug>/page.tsx`.
2. Compose components from `components/admin/`.
3. Add Sidebar nav entry under the Admin group.

### New UI Component

- Generic primitive → `components/ui/`.
- Domain-specific → `components/{domain}/`.

```tsx
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  className?: string;
}

export function ExampleCard({ title, className }: Props) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200 p-6", className)}>
      <h3 className="text-lg font-semibold text-[#0A0A0A]">{title}</h3>
    </div>
  );
}
```

### Wiring in the Backend

- Create `lib/services/*` modules for API calls.
- Swap pages from mock imports to service calls (ideally via Server Components).
- Add auth middleware + user/tenant context at the app root.
