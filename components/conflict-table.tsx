"use client";

import type { Conflict, ConflictResolution } from "@/lib/types";

interface ConflictTableProps {
  conflicts: Conflict[];
  onResolutionChange: (index: number, resolution: ConflictResolution) => void;
}

const typeLabels: Record<string, string> = {
  groups: "Group",
  posture_checks: "Posture Check",
  policies: "Policy",
  routes: "Route",
  dns: "DNS",
  networks: "Network",
};

export function ConflictTable({
  conflicts,
  onResolutionChange,
}: ConflictTableProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className="border border-amber-700/50 rounded-lg overflow-hidden">
      <div className="bg-amber-900/20 px-4 py-3 border-b border-amber-700/50">
        <h3 className="text-sm font-semibold text-amber-400">
          {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} detected
        </h3>
        <p className="text-xs text-amber-400/70 mt-1">
          These resources already exist in the destination. Choose how to handle each one.
        </p>
      </div>
      <div className="divide-y divide-nb-gray-800">
        {conflicts.map((conflict, i) => (
          <div
            key={`${conflict.resourceType}-${conflict.sourceId}`}
            className="flex items-center justify-between px-4 py-3"
          >
            <div>
              <span className="text-xs font-medium text-nb-gray-500 uppercase">
                {typeLabels[conflict.resourceType] || conflict.resourceType}
              </span>
              <p className="text-sm font-medium text-nb-gray-100">
                {conflict.sourceName}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onResolutionChange(i, "skip")}
                className={`px-3 py-1 text-xs rounded-md border ${
                  conflict.resolution === "skip"
                    ? "bg-nb-gray-800 border-nb-gray-700 text-nb-gray-200 font-medium"
                    : "border-nb-gray-800 text-nb-gray-500 hover:border-nb-gray-700"
                }`}
              >
                Skip
              </button>
              <button
                onClick={() => onResolutionChange(i, "overwrite")}
                className={`px-3 py-1 text-xs rounded-md border ${
                  conflict.resolution === "overwrite"
                    ? "bg-netbird-400/10 border-netbird-400/50 text-netbird-400 font-medium"
                    : "border-nb-gray-800 text-nb-gray-500 hover:border-nb-gray-700"
                }`}
              >
                Overwrite
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
