"use client";

import type { MigrationResult } from "@/lib/types";

interface MigrationSummaryProps {
  result: MigrationResult;
}

export function MigrationSummary({ result }: MigrationSummaryProps) {
  return (
    <div className="border border-nb-gray-800 rounded-lg p-3 bg-nb-gray-920">
      <h3 className="text-sm font-semibold text-nb-gray-100 mb-2">
        Migration Complete
      </h3>

      <div className={`grid grid-cols-3 gap-3${result.errors.length > 0 ? " mb-4" : ""}`}>
        <div className="text-center p-2 bg-green-900/20 rounded-lg">
          <p className="text-lg font-bold text-green-400">{result.created}</p>
          <p className="text-xs text-green-400/80 mt-1">Created</p>
        </div>
        <div className="text-center p-2 bg-nb-gray-900 rounded-lg">
          <p className="text-lg font-bold text-nb-gray-200">{result.skipped}</p>
          <p className="text-xs text-nb-gray-300 mt-1">Skipped</p>
          <p className="text-xs text-nb-gray-500">already existed</p>
        </div>
        <div className="text-center p-2 bg-red-900/20 rounded-lg">
          <p className="text-lg font-bold text-red-400">{result.failed}</p>
          <p className="text-xs text-red-400/80 mt-1">Failed</p>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-nb-gray-100 mb-2">Errors</h4>
          <div className="space-y-2">
            {result.errors.map((err, i) => (
              <div
                key={i}
                className="text-xs bg-red-900/20 border border-red-900/50 rounded p-2"
              >
                <span className="font-medium text-red-300">
                  [{err.resourceType}] {err.name}:
                </span>{" "}
                <span className="text-red-400">{err.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
