# NetBird Migration UI

A web application for migrating configurations between NetBird accounts. Connect to a source and destination NetBird instance, select resources to migrate, resolve conflicts, and execute the migration with real-time progress streaming.

## Stack

- Next.js 15 (App Router)
- React 19
- TypeScript 5.7
- Tailwind CSS 4.0

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

The app is a multi-step wizard:

1. **Connect** — Enter API tokens for your source and destination NetBird accounts
2. **Select Resources** — Choose which resources to migrate
3. **Resolve Conflicts** — For resources that exist in both accounts (matched by name), choose to skip or overwrite
4. **Execute** — Run the migration with live progress updates via SSE

## Supported Resources

Resources are migrated in dependency order:

1. Groups
2. Posture Checks
3. Policies
4. Routes
5. DNS Nameserver Groups
6. DNS Zones
7. Networks
8. Setup Keys
9. Account Settings

## Architecture

```
React Components (client)
    → Next.js API Routes (/app/api/)
        → NetBirdClient (lib/netbird-client.ts)
            → NetBird REST API
```

### Key Modules

| Module | Description |
|--------|-------------|
| `lib/netbird-client.ts` | HTTP wrapper for the NetBird API with auth and rate-limit retry |
| `lib/migration-engine.ts` | Orchestrates migration in dependency order, emits events for UI updates |
| `lib/id-mapping.ts` | Tracks source-to-destination ID mappings for reference resolution |
| `lib/types.ts` | TypeScript interfaces for all resources, state, and events |
| `hooks/use-migration-state.ts` | React Context provider for wizard state |

## Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build (includes type-checking)
npm run start    # Start production server
npm run lint     # Run ESLint
```
