"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/step-indicator";
import { ConflictTable } from "@/components/conflict-table";
import { MigrationProgress } from "@/components/migration-progress";
import { MigrationSummary } from "@/components/migration-summary";
import { useMigrationState } from "@/hooks/use-migration-state";
import type {
  Conflict,
  ConflictResolution,
  MigrationEvent,
  SourceResources,
  ResourceType,
} from "@/lib/types";

export default function ExecutePage() {
  const router = useRouter();
  const {
    source,
    destination,
    sourceConnected,
    destConnected,
    resources,
    selection,
    conflicts,
    events,
    result,
    migrating,
    setConflicts,
    addEvent,
    setResult,
    setMigrating,
    reset,
  } = useMigrationState();

  const [loadingConflicts, setLoadingConflicts] = useState(true);
  const [conflictsLoaded, setConflictsLoaded] = useState(false);
  const [error, setError] = useState("");

  const detectConflicts = useCallback(async () => {
    if (!destination || !resources) return;

    try {
      const res = await fetch("/api/destination", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: destination.token,
          url: destination.url,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch destination resources");
      }

      const destResources: SourceResources = await res.json();
      const detected: Conflict[] = [];

      // Check each resource type for name conflicts
      const checkConflicts = <T extends { id: string; name: string }>(
        type: ResourceType,
        sourceItems: T[],
        destItems: T[],
        selectedIds: string[]
      ) => {
        const destByName = new Map(
          destItems
            .filter((item) => item.name)
            .map((item) => [item.name.toLowerCase(), item])
        );
        for (const src of sourceItems) {
          if (!selectedIds.includes(src.id)) continue;
          if (!src.name) continue;
          const existing = destByName.get(src.name.toLowerCase());
          if (existing) {
            detected.push({
              resourceType: type,
              sourceId: src.id,
              sourceName: src.name,
              destinationId: existing.id,
              resolution: "skip",
            });
          }
        }
      };

      checkConflicts("groups", resources.groups, destResources.groups, selection.groups);
      checkConflicts(
        "posture_checks",
        resources.posture_checks,
        destResources.posture_checks,
        selection.posture_checks
      );
      checkConflicts("policies", resources.policies, destResources.policies, selection.policies);
      checkConflicts("routes", resources.routes, destResources.routes, selection.routes);
      checkConflicts("dns", resources.dns, destResources.dns, selection.dns);
      checkConflicts("networks", resources.networks, destResources.networks, selection.networks);
      checkConflicts(
        "dns_zones",
        resources.dns_zones || [],
        destResources.dns_zones || [],
        selection.dns_zones || []
      );

      setConflicts(detected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect conflicts");
    } finally {
      setLoadingConflicts(false);
      setConflictsLoaded(true);
    }
  }, [destination, resources, selection, setConflicts]);

  useEffect(() => {
    if ((!sourceConnected && !resources) || !destConnected) {
      router.push("/");
      return;
    }
    if (!resources) {
      router.push("/migrate");
      return;
    }
    if (!conflictsLoaded) {
      detectConflicts();
    }
  }, [sourceConnected, destConnected, resources, router, conflictsLoaded, detectConflicts]);

  // Scroll to top when page loads with completed migration
  useEffect(() => {
    if (result) {
      window.scrollTo(0, 0);
    }
  }, [result]);

  const handleResolutionChange = (index: number, resolution: ConflictResolution) => {
    const updated = [...conflicts];
    updated[index] = { ...updated[index], resolution };
    setConflicts(updated);
  };

  const executeMigration = async () => {
    if (!destination || !resources) return;

    setMigrating(true);
    setError("");

    try {
      const res = await fetch("/api/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceToken: source?.token || "",
          sourceUrl: source?.url || "",
          destToken: destination.token,
          destUrl: destination.url,
          resources,
          selection,
          conflicts,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "Migration failed" }));
        throw new Error(data.error || "Migration failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: MigrationEvent = JSON.parse(line.slice(6));
              addEvent(event);
              if (event.type === "complete") {
                setResult({
                  created: event.created || 0,
                  skipped: event.skipped || 0,
                  failed: event.failed || 0,
                  errors: [],
                });
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Migration failed");
    } finally {
      setMigrating(false);
    }
  };

  const handleStartNewMigration = () => {
    reset();
    router.push("/");
  };

  if (loadingConflicts) {
    return (
      <div>
        <StepIndicator currentStep={3} />
        <div className="text-center py-12">
          <svg className="animate-spin h-8 w-8 text-netbird-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-nb-gray-300">Checking for conflicts...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StepIndicator currentStep={3} />

      <div className="space-y-6">
        {conflicts.length > 0 && !migrating && !result && (
          <ConflictTable
            conflicts={conflicts}
            onResolutionChange={handleResolutionChange}
          />
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {!migrating && !result && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/migrate")}
              className="px-4 py-2 text-sm text-nb-gray-300 hover:text-nb-gray-100"
            >
              Back
            </button>
            <button
              onClick={executeMigration}
              className="px-6 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500"
            >
              Start Migration
            </button>
          </div>
        )}

        {(migrating || events.length > 0) && (
          <MigrationProgress events={events} migrating={migrating} />
        )}

        {result && <MigrationSummary result={result} />}

        {result && (
          <div className="flex justify-center">
            <button
              onClick={handleStartNewMigration}
              className="px-6 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500"
            >
              Start New Migration
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
