# WRK Copilot

WRK Copilot is a web app that helps businesses describe and manage automated workflows (automations) in a guided, collaborative way.

## Project Structure

This project has been refactored from raw Figma output into a clean **Next.js 14 App Router** project.

### Architecture

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **UI Components**: Radix UI primitives with custom styling
- **Deployment**: Optimized for Vercel

### Directory Structure

```
/
├── app/                          # Next.js App Router pages
│   ├── (studio)/                # Studio-side routes (client-facing)
│   │   └── automations/
│   ├── (admin)/                 # Admin-side routes (internal)
│   │   └── projects/
│   ├── (settings)/              # Settings routes
│   ├── layout.tsx               # Root layout with AppShell
│   ├── page.tsx                 # Home page (redirects to /automations)
│   └── globals.css              # Global styles
├── components/
│   ├── layout/                  # Layout components
│   │   ├── AppShell.tsx        # Main app shell
│   │   └── Sidebar.tsx         # Navigation sidebar
│   ├── ui/                      # Reusable UI components
│   │   ├── PageHeader.tsx
│   │   ├── StatCard.tsx
│   │   ├── SectionCard.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── AutomationCard.tsx
│   │   ├── AutomationGrid.tsx
│   │   └── [shadcn components]  # Radix UI-based components
│   └── brand/
│       └── WrkLogo.tsx
├── lib/
│   ├── types.ts                 # TypeScript type definitions
│   ├── mock-automations.ts      # Mock data for development
│   └── utils.ts                 # Utility functions
├── archive/
│   └── figma-original/          # Archived original Figma output
└── [config files]
```

### Key Features

#### Studio Side (Client-facing)

- **Automations Dashboard** (`/automations`)
  - List all automations with status, stats, and metadata
  - Create new automations
  - Filter and search automations

- **Automation Detail** (`/automations/[id]`)
  - Three-panel layout:
    - Left: Chat panel for requirements intake
    - Center: Blueprint/process map canvas
    - Right: Step details panel

#### Admin Side (Internal)

- **Projects Dashboard** (`/admin/projects`)
  - Manage client projects
  - View internal status and metrics

#### Settings

- **Workspace Settings** (`/settings`)
  - Configure workspace preferences
  - User account settings

### Development

#### Prerequisites

- Node.js 18+
- pnpm or npm

#### Setup

1. Install dependencies:

```bash
npm install
# or
pnpm install
```

2. Run development server:

```bash
npm run dev
# or
pnpm dev
```

3. Open [http://localhost:3000](http://localhost:3000)

#### Build

```bash
npm run build
npm start
```

### Deployment

This project is optimized for Vercel deployment:

1. Push to GitHub
2. Import project in Vercel
3. Deploy automatically

The project uses:

- Next.js default build output
- Static and server components where appropriate
- Optimized imports and lazy loading for heavy components

### Mock Data

Currently, the app uses mock data located in `lib/mock-automations.ts`. This will be replaced with real API calls when the backend is integrated.

### Notes

- All original Figma-generated code is archived in `archive/figma-original/` for reference
- The UI components in `components/ui/` are based on shadcn/ui patterns
- The design system uses consistent spacing, colors, and typography from the original Figma designs

### Next Steps

- [ ] Integrate backend API
- [ ] Add authentication
- [ ] Implement real-time features (chat, canvas updates)
- [ ] Add more automation management features
- [ ] Enhance admin dashboard with task management
