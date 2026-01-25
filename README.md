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

The app supports two migration modes:

### Option 1: Direct Migration

1. **Connect** — Enter API tokens for your source and destination NetBird accounts
2. **Select Resources** — Choose which resources to migrate
3. **Resolve Conflicts** — For resources that exist in both accounts (matched by name), choose to skip or overwrite
4. **Execute** — Run the migration with live progress updates via SSE

### Option 2: Export/Import (Ideal for Self-Hosted)

1. **Connect** to your source instance and click **Fetch & Export** to save the configuration to a JSON file
2. Transfer the file to a machine with access to your destination instance
3. **Connect** to your destination instance and click **Import Config** to load the saved configuration
4. **Select Resources**, resolve conflicts, and execute as above

This mode is ideal for self-hosted NetBird deployments where source and destination may not be accessible from the same network.

## Supported Resources

Resources are migrated in dependency order:

1. Groups
2. Posture Checks
3. Policies
4. Routes
5. DNS Nameserver Groups
6. DNS Zones
7. Networks
8. Account Settings

## Limitations

This tool migrates configuration only. The following are **not transferred**:

- **Peers** — must re-register on destination
- **Users** — managed via your identity provider
- **Group memberships** — groups are created empty
- **Setup key secrets** — new keys are generated, must redistribute
- **Personal Access Tokens** — must be recreated manually

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
