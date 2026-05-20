# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NetBird Migration UI — a Next.js web application for migrating configurations between NetBird accounts. Supports two workflows: direct migration (connect source and destination instances) and export/import (save configuration to file for self-hosted deployments). Users select resources to migrate, resolve conflicts, and execute the migration with real-time progress streaming.

**Stack:** Next.js 15 (App Router), React 19, TypeScript 5.7, Tailwind CSS 4.0

## Commands

```bash
npm run dev            # Start dev server (localhost:3000)
npm run build          # Production build (type-checks included)
npm run lint           # ESLint via Next.js
npx tsc --noEmit       # Type-check without building
npm test               # Run Vitest suite once
npm run test:watch     # Vitest in watch mode
npm run test:coverage  # Coverage report (v8)
npm run test:e2e       # Playwright end-to-end tests (boots dev server on :3211)
npm run test:e2e:ui    # Playwright UI mode for debugging
```

Tests use Vitest with MSW for HTTP-level mocking and a `RecordingMockClient` for engine-level integration. Fixtures live in `tests/fixtures/`, mocks in `tests/mocks/`. Coverage thresholds enforced: lines 75 / functions 90 / branches 60 / statements 75.

E2E tests live in `tests/e2e/` and run under Playwright. They mock every `/api/*` route via `page.route()` (see `tests/e2e/helpers/mocks.ts`) so they never touch real NetBird accounts. Stable element targeting via `data-testid` (`source-card`, `dest-card`).

## Docker

The app uses a multi-stage Docker build with `output: 'standalone'` in `next.config.ts` for minimal image size (~100-150MB).

```bash
docker build -t netbird-migrate-ui .   # Build image
docker run -p 3000:3000 netbird-migrate-ui  # Run container
docker compose up -d                   # Or use docker-compose
```

## Architecture

### Data Flow

```
React Components (client)
    → Next.js API Routes (/app/api/)
        → NetBirdClient (lib/netbird-client.ts)
            → NetBird REST API
```

The migration endpoint (`/api/migrate/route.ts`) streams results back via SSE (Server-Sent Events).

### Key Modules

- **`lib/netbird-client.ts`** — HTTP wrapper for the NetBird API. Handles auth (`Token` header), rate limiting (429 retry), and all CRUD operations for each resource type including Reverse Proxy domains and services.
- **`lib/migration-engine.ts`** — Orchestrates migration in dependency order: groups → posture checks → policies → routes → DNS → DNS settings → DNS zones → networks → reverse proxy domains → reverse proxy services → account settings. Emits `MigrationEvent` objects for real-time UI updates. Dependency ordering is enforced by tests in `lib/migration-engine.ordering.test.ts`.
- **`lib/id-mapping.ts`** — Tracks source-to-destination ID mappings so dependent resources (policies referencing groups, routes referencing groups, reverse proxy service `authentication.userGroups`, etc.) can resolve references correctly.
- **`lib/types.ts`** — All TypeScript interfaces for NetBird resources, migration state, conflicts, and events.
- **`lib/schemas.ts`** — Zod schemas validating inbound payloads on every `/api/*` route. Server-side trust boundary — request bodies are `safeParse`d before the handler does anything else.
- **`lib/platform.ts`** — Detects whether a NetBird URL points at cloud or self-hosted. Used to skip Reverse Proxy auto-selection on cross-platform migrations (domains/services are pinned to a cluster and can't move between deployments).
- **`lib/build-auto-selection.ts`** — Generates default resource selection from fetched source resources. Skips Reverse Proxy resources when source/dest platforms differ.
- **`lib/rate-limiter.ts`** — Per-(IP, path) sliding-window rate limiter for the Next.js API routes.
- **`lib/url-validator.ts`** — Validates and normalizes NetBird API URLs (SSRF guard against private IPs and `.internal`/`.local` hosts).
- **`hooks/use-migration-state.ts`** — React Context provider holding the entire wizard state (connections, resources, selections, conflicts, events, results).
- **`components/import-modal.tsx`** — Modal for importing saved configuration files (export/import workflow).

### UI Flow (Multi-Step Wizard)

1. **`app/page.tsx`** — Connect source + destination via direct migration (validates with test API call) or import saved configuration file (export/import workflow for self-hosted deployments)
2. **`app/migrate/page.tsx`** — Select resources to migrate (auto-selects all valid)
3. Conflict resolution (inline in execute page)
4. Migration execution with live progress stream

### Adding a New Migrateable Resource Type

1. Add the TypeScript interface to `lib/types.ts`
2. Add field to `SourceResources` and `ResourceSelection` interfaces
3. Add Zod schemas in `lib/schemas.ts` so the `/api/migrate` request validates
4. Add fetch method(s) to `NetBirdClient` and include them in `getAllResources()`
5. Add private `migrate*` method to `MigrationEngine.execute()` (respect dependency order)
6. Add a new test case in `lib/migration-engine.ordering.test.ts` asserting any new "X precedes Y" relationship
7. Add auto-selection logic to `buildAutoSelection()` in `lib/build-auto-selection.ts`
8. Add `<ResourceList>` in `app/migrate/page.tsx`
9. Add `resourceTypeLabels` entry in `components/import-modal.tsx`
10. If the resource references groups, use `this.idMap.mapGroupIds()` for ID translation

### Adding an Account Settings Sub-Field

Account settings aren't a separate resource type — they're a single PUT to `/accounts/{id}` at the end of the migration. Each migrate-able sub-field gets its own entry in `selection.account_settings` (using a stable string id like `"jwt_allow_groups"`). Steps to add one:

1. Add the field to `AccountSettings` (or nested `AccountSettingsExtra`) in `lib/types.ts`
2. Extend `AccountSettingsSchema` in `lib/schemas.ts`
3. In `lib/netbird-client.ts` `getAllResources()`, copy the field out of `accounts[0].settings`
4. In `lib/migration-engine.ts` `migrateAuthSettings()`, add an `if (selectedIds.includes("<id>"))` branch that writes the field onto the merged settings object. Sub-fields under `extra` go inside the `extraSelections` branch
5. In `lib/build-auto-selection.ts`, push the id onto `authSettingIds` when the source has the field populated
6. Render the field in an appropriate `ResourceList` card on `app/migrate/page.tsx` and in the `import-modal.tsx` preview
7. If the field references group IDs, route the values through `this.idMap.mapGroupIds()` — this works because `migrateAuthSettings` is the last step in the pipeline, so the group id map is fully populated. For `Record<string, string[]>` shapes (like `authorized_groups`), translate the *keys* and pass through the values

Look at how IPv6 (`network_range_v6`, `ipv6_enabled_groups`) and JWT (`jwt_allow_groups`) are wired for a complete worked example.

### Conflict Resolution

Resources are matched by name (case-insensitive). When a source resource name exists in the destination, users choose per-conflict: **skip** (leave destination as-is) or **overwrite** (update destination with source data).

### Reverse Proxy: cross-platform constraint

Reverse Proxy domains and services are pinned to a specific proxy cluster (CE and Cloud use different cluster infrastructure). When source and destination platforms differ (detected via `lib/platform.ts`), the migrate page hides those cards and `buildAutoSelection` returns empty arrays for them. Same-platform migrations still filter out platform-provided cluster domains (the ones with empty IDs, e.g. `type: "free"`).

### Styling

Dark theme using custom Tailwind colors: `netbird-*` (orange accent), `nb-gray-*` (dark backgrounds/text). Defined in `app/globals.css` via `@theme`.
