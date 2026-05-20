# NetBird Migration UI

A web application for migrating configurations between NetBird accounts. Connect to a source and destination NetBird instance, select resources to migrate, resolve conflicts, and execute the migration with real-time progress streaming.

## Stack

- Next.js 15 (App Router)
- React 19
- TypeScript 5.7
- Tailwind CSS 4.0

## Getting Started

### Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker

```bash
# Build and run with docker-compose
docker compose up -d

# Or build and run manually
docker build -t netbird-migrate-ui .
docker run -p 3000:3000 netbird-migrate-ui
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

Resources are migrated in strict dependency order so referenced IDs always exist before they're referenced:

1. Groups
2. Posture Checks
3. Policies (rules reference groups + posture checks)
4. Routes (reference peer groups + groups)
5. DNS Nameserver Groups (reference groups)
6. DNS Settings (`disabled_management_groups`)
7. DNS Zones (records created after the zone)
8. Networks (resources + routers created under each network)
9. Reverse Proxy Domains
10. Reverse Proxy Services (reference a domain, optionally a `userGroups` allowlist)
11. Account Settings (last — merged into existing destination settings, not replaced)

Dependency ordering is enforced by an explicit test suite (`lib/migration-engine.ordering.test.ts`).

## Limitations

This tool migrates configuration only. The following are **not transferred**:

- **Peers** — must re-register on destination
- **Users** — managed via your identity provider
- **Group memberships** — groups are created empty
- **Setup key secrets** — new keys are generated, must redistribute
- **Personal Access Tokens** — must be recreated manually
- **Ephemeral Reverse Proxy services** — CLI-exposed (`netbird expose`) services are short-lived and skipped
- **Reverse Proxy across platforms** — domains and services are pinned to a specific proxy cluster, so they can't move between self-hosted and NetBird Cloud. The wizard auto-deselects them when source and destination platforms differ.
- **Reverse Proxy TLS certificates** — managed by the destination cluster, not migrated

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
npm run dev            # Start dev server
npm run build          # Production build (includes type-checking)
npm run start          # Start production server
npm run lint           # Run ESLint
npm test               # Run the Vitest test suite
npm run test:watch     # Vitest in watch mode
npm run test:coverage  # Coverage report
npm run test:e2e       # Playwright end-to-end tests
npm run test:e2e:ui    # Playwright UI mode
```
