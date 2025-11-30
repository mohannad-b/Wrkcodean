# WRK Copilot Front-End Architecture

## Overview

WRK Copilot is a workflow automation platform front-end built with Next.js and TypeScript. The application provides two primary user interfaces:

1. **Studio** - Client-facing interface for managing automations, viewing dashboards, and configuring workflows
2. **Admin** - Internal operations console for managing clients, projects, pricing, and build status

### High-Level Goals

- **Reusable Component Architecture**: Shared UI components used across both Studio and Admin surfaces
- **Type-Safe Development**: Strict TypeScript configuration ensures type safety throughout
- **Scalable Routing**: Next.js App Router with route groups for logical organization
- **Design System Consistency**: Tailwind CSS with shared design tokens and component patterns
- **Future-Ready**: Architecture anticipates backend integration while currently using mock data

### Tech Stack

- **Framework**: Next.js 14.2.18 (App Router)
- **Language**: TypeScript 5.5.4 (strict mode)
- **Styling**: Tailwind CSS 3.4.17
- **UI Components**: Radix UI primitives with custom styling
- **Icons**: Lucide React
- **State Management**: React hooks (useState, useMemo, useCallback)
- **Testing**: Vitest 4.0.14 + React Testing Library
- **Code Quality**: ESLint 8.57.1 + Prettier 3.2.5
- **Heavy Libraries**:
  - React Flow 11.11.4 (workflow canvas visualization)
  - Recharts 2.15.2 (data visualization)
  - Motion 12.0.0 (animations)

---

## Project Structure

```
Wrkcodean/
├── app/                    # Next.js App Router routes
│   ├── (studio)/          # Route group: Client-facing pages
│   │   ├── automations/   # Automation management
│   │   ├── dashboard/     # Client dashboard
│   │   ├── messages/      # Messaging interface
│   │   ├── tasks/         # Task management
│   │   ├── team/          # Team management
│   │   ├── user-settings/ # User preferences
│   │   └── workspace-settings/ # Workspace configuration
│   ├── (settings)/        # Route group: Settings pages
│   ├── admin/             # Admin console routes
│   │   ├── clients/       # Client management
│   │   └── projects/      # Project management
│   ├── layout.tsx         # Root layout (AppShell wrapper)
│   ├── page.tsx           # Root page (redirects to /automations)
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── admin/            # Admin-specific components
│   ├── automations/       # Automation domain components
│   ├── layout/            # Layout components (AppShell, Sidebar)
│   ├── ui/                # Reusable UI primitives
│   ├── modals/            # Modal dialogs
│   ├── settings/           # Settings components
│   └── ...                # Other domain components
├── lib/                   # Shared utilities and data
│   ├── types.ts           # TypeScript type definitions
│   ├── utils.ts           # Helper functions
│   ├── mock-*.ts          # Mock data files
│   └── admin-mock.ts       # Admin-specific mock data
├── tests/                 # Test files
│   ├── components/        # Component tests
│   ├── pages/             # Page tests
│   └── setupTests.ts      # Test configuration
├── archive/               # Original Figma designs (reference only)
└── public/                # Static assets
```

### Key Directories

- **`app/`**: Next.js App Router routes. Route groups `(studio)` and `(settings)` organize pages without affecting URLs. `admin/` is a plain folder (not a route group) that creates `/admin/*` routes.
- **`components/`**: Organized by domain/functionality. `ui/` contains reusable primitives, others are domain-specific
- **`lib/`**: Shared code - types, utilities, and mock data. No business logic yet (front-end only phase)
- **`tests/`**: Vitest test files mirroring the component/page structure
- **`archive/`**: Original Figma-to-React code (reference only, not imported)

---

## Routing & Layout (App Router)

### Route Structure

The application uses Next.js App Router with route groups for logical organization:

```
/                           → app/page.tsx (redirects to /automations)
/automations                → app/(studio)/automations/page.tsx
/automations/[automationId] → app/(studio)/automations/[automationId]/page.tsx
/automations/new            → app/(studio)/automations/new/page.tsx
/dashboard                  → app/(studio)/dashboard/page.tsx
/admin                     → app/admin/page.tsx (redirects to /admin/clients)
/admin/clients              → app/admin/clients/page.tsx
/admin/clients/[clientId]   → app/admin/clients/[clientId]/page.tsx
/admin/projects             → app/admin/projects/page.tsx
/admin/projects/[projectId] → app/admin/projects/[projectId]/page.tsx
/settings                   → app/(settings)/page.tsx
```

**Route Groups** (`(studio)`, `(settings)`) don't affect URLs but allow:
- Shared layouts per group (future)
- Logical organization in the file system
- Different navigation behavior per section

### Global Layout System

**Root Layout** (`app/layout.tsx`):
- Wraps all pages with `<AppShell>`
- Sets global metadata
- Imports global CSS

**AppShell** (`components/layout/AppShell.tsx`):
- Provides the main application shell
- Renders `<Sidebar>` on the left
- Main content area with proper spacing (`md:pl-64`)

**Sidebar** (`components/layout/Sidebar.tsx`):
- Collapsible navigation sidebar
- Dynamically shows Studio or Admin navigation based on route
- Uses `usePathname()` to highlight active routes
- Responsive: collapses to icon-only on mobile

### Page Structure Pattern

Most pages follow this structure:

```tsx
export default function PageName() {
  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6 md:p-10 space-y-8">
        <PageHeader title="..." subtitle="..." actions={...} />
        {/* Page content */}
      </div>
    </div>
  );
}
```

**Key Patterns**:
- Full-height containers with `overflow-y-auto` for scrollable content
- Max-width containers (`max-w-[1600px]`) for readability
- Consistent padding (`p-6 md:p-10`)
- `PageHeader` component for consistent page headers

---

## UI Components & Design System

### Component Organization

Components are organized by domain and reusability:

#### Layout Components (`components/layout/`)
- **`AppShell.tsx`**: Root layout wrapper with sidebar
- **`Sidebar.tsx`**: Navigation sidebar with route detection

#### Page Scaffolding (`components/ui/`)
- **`PageHeader.tsx`**: Standardized page headers with title, subtitle, and actions
- **`SectionCard.tsx`**: White card container for content sections
- **`StatCard.tsx`**: KPI/metric display cards
- **`StatusBadge.tsx`**: Status indicators with color coding

#### Domain Components

**Automations** (`components/automations/`):
- `StudioCanvas.tsx`: React Flow canvas for workflow visualization
- `StudioChat.tsx`: AI chat interface for automation building
- `StudioInspector.tsx`: Side panel for step configuration
- Tab components: `OverviewTab`, `BuildStatusTab`, `TestTab`, etc.

**Admin** (`components/admin/`):
- `SpendSummaryCard.tsx`: Client/project spend metrics
- `PricingOverridePanel.tsx`: Pricing configuration UI
- `ConversationThread.tsx`: Project chat interface
- `MessageComposer.tsx`: Message input component

**UI Primitives** (`components/ui/`):
- Radix UI components with custom styling (button, input, select, dialog, etc.)
- Domain-specific cards: `AutomationCard`, `ProjectCard`, `TaskCard`
- Layout helpers: `AutomationGrid`, `AutomationList`

### Design Tokens & Styling

**Color Palette** (from `app/globals.css` and Tailwind config):
- Primary brand: `#E43632` (red)
- Background: `#F9FAFB` / `#F5F5F5`
- Text: `#0A0A0A` (near-black), `#1A1A1A` (body)
- Grays: Standard Tailwind gray scale
- Status colors:
  - Success: Emerald (`bg-emerald-50 text-emerald-700`)
  - Warning: Amber (`bg-amber-50 text-amber-700`)
  - Error: Red (`bg-red-50 text-red-700`)
  - Info: Blue (`bg-blue-50 text-blue-700`)

**Typography**:
- Font family: Inter, Manrope, system fonts
- Headings: `font-bold`, `tracking-tight`
- Body: `text-sm` or `text-base`

**Spacing**:
- Consistent padding: `p-6` (mobile), `p-10` (desktop)
- Gap spacing: `gap-3`, `gap-6`, `gap-8` for vertical rhythm
- Card padding: `p-6` standard

**Component Patterns**:
- Cards: `bg-white rounded-xl border border-gray-200 shadow-sm`
- Buttons: Primary `bg-[#0A0A0A] text-white`, Secondary `variant="outline"`
- Inputs: `bg-gray-50 border-gray-200 focus:bg-white`
- Badges: Rounded with status-appropriate colors

### Reusability Strategy

1. **UI Primitives** (`components/ui/`): Base components (Button, Input, Badge) used everywhere
2. **Page Scaffolding**: `PageHeader`, `SectionCard`, `StatCard` for consistent page structure
3. **Domain Components**: Reusable within their domain (e.g., `AutomationCard` in Studio)
4. **Shared Patterns**: Status badges, avatars, progress indicators used across both Studio and Admin

---

## State Management & Data Flow (Current Phase)

### Current Approach: Front-End Only

**No Backend Yet**: All data is mocked and lives in `lib/mock-*.ts` files.

**Mock Data Files**:
- `lib/mock-automations.ts`: Automation summaries, current user
- `lib/mock-clients.ts`: Client data for admin console
- `lib/admin-mock.ts`: Admin projects, messages, spend summaries
- `lib/mock-dashboard.ts`: Dashboard metrics and activity feed
- `lib/mock-blueprint.ts`: Workflow node/edge data for canvas

**Data Flow Pattern**:

```tsx
// Page component imports mock data directly
import { mockAutomations } from "@/lib/mock-automations";

export default function AutomationsPage() {
  const [filter, setFilter] = useState("all");
  
  // Client-side filtering/memoization
  const filtered = useMemo(() => {
    return mockAutomations.filter(...);
  }, [filter]);
  
  return <AutomationGrid automations={filtered} />;
}
```

**Current State Management**:
- **Local State**: `useState` for UI state (filters, modals, tabs)
- **Derived State**: `useMemo` for filtered/computed data
- **No Global State**: No Redux, Zustand, or Context API yet
- **URL State**: `useSearchParams` for some settings pages (wrapped in Suspense)

### Future Integration Points

When backend is added, data flow will shift to:

1. **API Routes** (`app/api/`): Next.js API routes for backend communication
2. **Service Layer** (`lib/services/`): Functions that call API routes
3. **React Server Components**: Pages fetch data on the server
4. **Client Components**: Use hooks like `useSWR` or React Query for client-side data fetching
5. **Auth Context**: User session and tenant scoping

**Example Future Pattern**:

```tsx
// Future: Server Component
export default async function AutomationsPage() {
  const automations = await getAutomations(); // Server-side fetch
  return <AutomationGrid automations={automations} />;
}

// Future: Client Component with hooks
function AutomationCard({ id }: { id: string }) {
  const { data } = useSWR(`/api/automations/${id}`, fetcher);
  // ...
}
```

---

## Styling & Layout System

### Tailwind CSS Configuration

**Config** (`tailwind.config.ts`):
- Dark mode: Class-based (prepared but not actively used)
- Content paths: Scans `app/`, `components/`, `pages/`
- Custom colors: CSS variables for theming
- Font family: Inter, Manrope, system stack

**Global Styles** (`app/globals.css`):
- CSS variables for colors (`--background`, `--foreground`)
- Base typography styles
- Custom scrollbar styling
- Utility classes for common patterns

### Layout Patterns

**Container Pattern**:
```tsx
<div className="max-w-[1600px] mx-auto p-6 md:p-10">
  {/* Content */}
</div>
```

**Card Pattern**:
```tsx
<div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
  {/* Content */}
</div>
```

**Grid Patterns**:
- Stats: `grid grid-cols-1 md:grid-cols-4 gap-6`
- Content sections: `grid grid-cols-1 lg:grid-cols-3 gap-6`
- Automation grid: Custom `AutomationGrid` component

**Responsive Design**:
- Mobile-first: Base styles for mobile, `md:` breakpoint for desktop
- Sidebar: Hidden on mobile (`hidden md:flex`)
- Padding: `p-6` mobile, `p-10` desktop
- Text sizes: Responsive with `text-2xl md:text-3xl`

### Styling Guidelines

1. **Use Tailwind utilities**: Prefer Tailwind classes over custom CSS
2. **Consistent spacing**: Use Tailwind spacing scale (`gap-3`, `p-6`, `mb-4`)
3. **Color consistency**: Use design tokens (`text-[#0A0A0A]`, `bg-[#E43632]`)
4. **Component composition**: Build complex UIs from smaller styled components
5. **Responsive**: Always consider mobile and desktop layouts

---

## Testing & Code Quality

### Testing Setup

**Vitest Configuration** (`vitest.config.ts`):
- Environment: `jsdom` for DOM testing
- Setup file: `tests/setupTests.ts` (jest-dom matchers)
- Path aliases: `@/` resolves to project root
- Excludes: `node_modules`, `.next`, `archive`

**Test Structure**:
```
tests/
├── components/
│   ├── layout/
│   │   └── AppShell.test.tsx
│   └── ui/
│       └── StatusBadge.test.tsx
├── pages/
│   └── automations.test.tsx
└── setupTests.ts
```

**Test Examples**:
- Component rendering: `AppShell.test.tsx` - verifies layout structure
- UI components: `StatusBadge.test.tsx` - checks status styling
- Page components: `automations.test.tsx` - verifies page content and interactions

**Critical Flows That Must Have Tests**:
The following critical user flows should always have test coverage:

1. **Automations Page** (`/automations`):
   - ✅ Basic render test exists (`tests/pages/automations.test.tsx`)
   - Should test: filtering, search, view toggle (grid/list), navigation to detail pages

2. **Admin Clients Page** (`/admin/clients`):
   - ⚠️ Test needed: Verify client list renders, filtering works, navigation to client detail

3. **Admin Project Detail** (`/admin/projects/[projectId]`):
   - ⚠️ Test needed: Verify project data displays, tabs work, pricing panel renders

**Testing Expectations**:
- **New Pages**: Any new page must have at least one basic render test
- **Critical Components**: Layout components, navigation, and data display components should have tests
- **User Interactions**: Key user flows (filtering, navigation, form submission) should be tested

**Test Scripts**:
- `npm run test`: Run tests once
- `npm run test:watch`: Watch mode
- `npm run test:coverage`: Coverage report

### Code Quality Tools

**ESLint** (`.eslintrc.json`):
- Extends: `next/core-web-vitals`, `next/typescript`, `prettier`
- Rules: React hooks exhaustive deps warning
- Config: Next.js recommended + TypeScript support

**Prettier** (`.prettierrc`):
- Semicolons: Yes
- Single quotes: No (double quotes)
- Print width: 100
- Tab width: 2 spaces

**TypeScript** (`tsconfig.json`):
- **Strict mode**: All strict flags enabled
- **Path aliases**: `@/*` → `./*`
- **Target**: ES2017
- **Module resolution**: `bundler` (Next.js)

**Quality Scripts**:
- `npm run lint`: ESLint check
- `npm run lint:fix`: Auto-fix ESLint issues
- `npm run format`: Prettier format
- `npm run format:check`: Prettier check
- `npm run type-check`: TypeScript type checking

### Code Quality Standards

1. **TypeScript**: Strict mode, no `any` types (use proper types)
2. **ESLint**: No warnings/errors before commit
3. **Prettier**: All files formatted consistently
4. **Imports**: Use path aliases (`@/components/...`)
5. **Components**: Functional components with TypeScript interfaces
6. **Accessibility**: `aria-label` for icon-only buttons, semantic HTML

---

## Performance & Optimization

### Current Optimizations

**Next.js Configuration** (`next.config.mjs`):
- **SWC Minification**: Enabled for faster builds
- **Console Removal**: Production builds remove console.log
- **Image Optimization**: Next.js Image component with allowed domains
- **Bundle Splitting**: Custom webpack config separates heavy libraries:
  - `reactflow` → separate chunk
  - `recharts` → separate chunk
  - `motion` → separate chunk
  - `@radix-ui/*` → vendor chunk

**Code Splitting**:
- **Dynamic Imports**: Heavy libraries are lazy-loaded:
  - `StudioCanvas` (React Flow ~200KB) - dynamically imported in both Studio and Admin project detail pages
  - React Flow hooks (`useNodesState`, `useEdgesState`) are imported directly but are lightweight
  ```tsx
  const StudioCanvas = dynamic(() => import("@/components/automations/StudioCanvas"), {
    ssr: false,
    loading: () => <div>Loading canvas...</div>
  });
  ```
- **Motion**: Used in dashboard for animations but imported directly (acceptable as it's moderate size)

**React Optimizations**:
- **Memoization**: `useMemo` for expensive computations (filtering, sorting)
- **Stable References**: React Flow `nodeTypes`, `edgeTypes` defined outside components
- **Component Composition**: Small, focused components for better tree-shaking

### Performance Recommendations

1. **Lazy Load Heavy Features**: Continue using dynamic imports for large libraries
2. **Avoid Top-Level Imports**: Don't import React Flow, Recharts at page level unless needed
3. **Memoize Expensive Operations**: Use `useMemo` for filtered/sorted lists
4. **Optimize Images**: Use Next.js `Image` component (not yet implemented, but prepared)
5. **Bundle Analysis**: Run `npm run analyze` to check bundle sizes
6. **Server Components**: When backend is added, use Server Components for data fetching

### Known Performance Considerations

- **React Flow**: Heavy library, always lazy-loaded
- **Recharts**: Moderate size, consider lazy-loading for dashboard pages
- **Large Lists**: Current mock data is small; implement pagination/virtualization for large datasets

---

## Security & Future Integration Points

### Current Security Practices

**Front-End Security**:
- **`dangerouslySetInnerHTML`**: Used in `components/ui/chart.tsx` for CSS theme injection. TODO: Content must be sanitized before production use. Consider using CSS-in-JS or CSS variables instead.
- **Input Validation**: Client-side validation in forms (React Hook Form available in `components/ui/form.tsx`, but not yet actively used in pages)
- **XSS Prevention**: React's built-in escaping for most content
- **Type Safety**: TypeScript prevents many runtime errors

### Backend Security Contract

When backend services are integrated, the following security contract must be enforced:

**Authentication & Authorization**:
- `tenantId` and `userId` **MUST** come from the authenticated session (server-side), never from:
  - Request bodies
  - Query parameters
  - URL paths (except for display purposes)
  - Client-side state

**API Handler Requirements**:
- All future API handlers (`app/api/**`) **MUST**:
  1. **Enforce tenant scoping**: Verify the authenticated user has access to the requested tenant
  2. **Schema validation at the edge**: Validate all inputs using Zod or similar before processing
  3. **Session validation**: Verify session is valid and user is authenticated
  4. **Rate limiting**: Implement rate limiting to prevent abuse

**Example Pattern** (future):
```tsx
// app/api/automations/route.ts
import { getSession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  // tenantId and userId come from session, not body
});

export async function POST(req: Request) {
  const session = await getSession(); // Gets tenantId and userId from session
  if (!session) return new Response("Unauthorized", { status: 401 });
  
  const body = await req.json();
  const validated = schema.parse(body); // Validate input
  
  // Use session.tenantId, not body.tenantId
  const automation = await createAutomation({
    ...validated,
    tenantId: session.tenantId,
    userId: session.userId,
  });
  
  return Response.json(automation);
}
```

**No Auth Yet**: Authentication and authorization will be added with backend.

### Future Integration Points

**Authentication**:
- **Session Management**: Next.js middleware for route protection
- **User Context**: React Context or Zustand for user state
- **Token Storage**: Secure HTTP-only cookies (server-side)

**API Integration**:
- **API Routes**: `app/api/` directory for Next.js API routes
- **Service Layer**: `lib/services/` for API client functions
- **Error Handling**: Centralized error handling for API calls
- **Loading States**: Skeleton loaders and loading indicators

**Tenant Scoping**:
- **Multi-tenancy**: Client/workspace isolation
- **Route Protection**: Middleware to verify tenant access
- **Data Filtering**: Server-side filtering by tenant ID

**Data Validation**:
- **Zod/Schema Validation**: Validate API responses and form inputs
- **Type Safety**: Shared types between front-end and backend

---

## Extending the Front-End

### Adding New Pages/Routes

**Studio Pages**:
1. Create route in `app/(studio)/your-feature/page.tsx`
2. Use `PageHeader` for consistent header
3. Import mock data from `lib/mock-*.ts` (or create new mock file)
4. Follow existing page structure pattern
5. Add navigation link to `components/layout/Sidebar.tsx` if needed

**Admin Pages**:
1. Create route in `app/admin/your-feature/page.tsx`
2. Use admin-specific components from `components/admin/`
3. Import from `lib/admin-mock.ts` for data
4. Add to `adminNavItems` in `Sidebar.tsx`

**Example**:
```tsx
// app/(studio)/reports/page.tsx
"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { mockReports } from "@/lib/mock-reports";

export default function ReportsPage() {
  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6 md:p-10 space-y-8">
        <PageHeader title="Reports" subtitle="View automation reports" />
        {/* Content */}
      </div>
    </div>
  );
}
```

### Adding New UI Components

**Reusable Primitive** (`components/ui/`):
1. Create component file: `components/ui/YourComponent.tsx`
2. Use Radix UI if it's an interactive component
3. Style with Tailwind using design tokens
4. Export TypeScript interface for props
5. Add to component exports if needed

**Domain Component** (`components/your-domain/`):
1. Create domain folder if it doesn't exist
2. Build component using UI primitives
3. Keep it focused on the domain (automations, admin, etc.)

**Example**:
```tsx
// components/ui/YourComponent.tsx
import { cn } from "@/lib/utils";

interface YourComponentProps {
  title: string;
  className?: string;
}

export function YourComponent({ title, className }: YourComponentProps) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200 p-6", className)}>
      <h3 className="text-lg font-bold text-[#0A0A0A]">{title}</h3>
    </div>
  );
}
```

### Integrating Backend Services

**When Backend is Ready**:

1. **Create API Client**:
   ```tsx
   // lib/services/api.ts
   export async function getAutomations() {
     const res = await fetch('/api/automations');
     return res.json();
   }
   ```

2. **Update Pages to Server Components**:
   ```tsx
   // app/(studio)/automations/page.tsx
   import { getAutomations } from "@/lib/services/api";
   
   export default async function AutomationsPage() {
     const automations = await getAutomations();
     return <AutomationGrid automations={automations} />;
   }
   ```

3. **Add Loading States**:
   ```tsx
   // Use Suspense boundaries
   <Suspense fallback={<Skeleton />}>
     <AutomationsPage />
   </Suspense>
   ```

4. **Error Handling**:
   ```tsx
   // Use error boundaries and try/catch
   try {
     const data = await getAutomations();
   } catch (error) {
     // Handle error
   }
   ```

### Suggested Patterns

1. **Component Composition**: Build complex UIs from smaller components
2. **Type Safety**: Always define TypeScript interfaces for props and data
3. **Consistent Styling**: Use design tokens and shared components
4. **Accessibility**: Include `aria-label` for icon buttons, semantic HTML
5. **Performance**: Lazy-load heavy libraries, memoize expensive computations
6. **Testing**: Write tests for key components and user flows

---

## Conclusion

This architecture document reflects the current state of the WRK Copilot front-end as a **front-end only** application using mock data. The structure is designed to scale when backend services, authentication, and real data are integrated.

**Key Principles**:
- **Reusability**: Shared components across Studio and Admin
- **Type Safety**: Strict TypeScript throughout
- **Consistency**: Design system and component patterns
- **Performance**: Optimized bundle splitting and lazy loading
- **Future-Ready**: Architecture anticipates backend integration

For questions or contributions, refer to this document and the existing codebase patterns.

