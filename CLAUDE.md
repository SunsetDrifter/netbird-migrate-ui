# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NetBird Migration UI — a Next.js web application for migrating configurations between NetBird accounts. Supports two workflows: direct migration (connect source and destination instances) and export/import (save configuration to file for self-hosted deployments). Users select resources to migrate, resolve conflicts, and execute the migration with real-time progress streaming.

**Stack:** Next.js 15 (App Router), React 19, TypeScript 5.7, Tailwind CSS 4.0

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build (type-checks included)
npm run lint     # ESLint via Next.js
npx tsc --noEmit # Type-check without building
```

No test framework is configured.

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

- **`lib/netbird-client.ts`** — HTTP wrapper for the NetBird API. Handles auth (`Token` header), rate limiting (429 retry), and all CRUD operations for each resource type.
- **`lib/migration-engine.ts`** — Orchestrates migration in dependency order: groups → posture checks → policies → routes → DNS → DNS zones → networks → account settings. Emits `MigrationEvent` objects for real-time UI updates.
- **`lib/id-mapping.ts`** — Tracks source-to-destination ID mappings so dependent resources (policies referencing groups, routes referencing groups, etc.) can resolve references correctly.
- **`lib/types.ts`** — All TypeScript interfaces for NetBird resources, migration state, conflicts, and events.
- **`lib/build-auto-selection.ts`** — Generates default resource selection from fetched source resources.
- **`lib/rate-limiter.ts`** — Token bucket rate limiter for API request throttling.
- **`lib/url-validator.ts`** — Validates and normalizes NetBird API URLs.
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
3. Add fetch method(s) to `NetBirdClient`
4. Add private `migrate*` method to `MigrationEngine.execute()` (respect dependency order)
5. Add auto-selection logic to `buildAutoSelection()` in `lib/build-auto-selection.ts`
6. Add `<ResourceList>` in `app/migrate/page.tsx`
7. If the resource references groups, use `this.idMap.mapGroupIds()` for ID translation

### Conflict Resolution

Resources are matched by name (case-insensitive). When a source resource name exists in the destination, users choose per-conflict: **skip** (leave destination as-is) or **overwrite** (update destination with source data).

### Styling

Dark theme using custom Tailwind colors: `netbird-*` (orange accent), `nb-gray-*` (dark backgrounds/text). Defined in `app/globals.css` via `@theme`.
