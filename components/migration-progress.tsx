"use client";

import { useState } from "react";
import type { MigrationEvent } from "@/lib/types";

interface MigrationProgressProps {
  events: MigrationEvent[];
  migrating: boolean;
}

export function MigrationProgress({ events, migrating }: MigrationProgressProps) {
  const [copied, setCopied] = useState(false);

  function copyLog() {
    const text = events
      .map((e) => {
        const symbol =
          e.type === "error" ? "x" : e.type === "success" ? "+" : e.type === "complete" ? "=" : "-";
        return `${symbol} ${e.message}`;
      })
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="border border-nb-gray-800 rounded-lg overflow-hidden">
      <div className="bg-nb-gray-900 px-4 py-3 border-b border-nb-gray-800 flex items-center gap-2">
        {migrating && (
          <svg className="animate-spin h-4 w-4 text-netbird-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        <h3 className="text-sm font-semibold text-nb-gray-100">
          {migrating ? "Migrating..." : "Migration Log"}
        </h3>
        {events.length > 0 && (
          <button
            onClick={copyLog}
            className="ml-auto p-1 text-netbird-400 hover:text-netbird-300 transition-colors"
            title="Copy log to clipboard"
          >
            {copied ? (
              <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto p-4 space-y-1 font-mono text-xs bg-nb-gray-950">
        {events.length === 0 && (
          <p className="text-nb-gray-500">Waiting for migration to start...</p>
        )}
        {[...events].sort((a, b) => {
          const order = { progress: 0, success: 1, error: 2, complete: 3 };
          return (order[a.type] ?? 1) - (order[b.type] ?? 1);
        }).map((event, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 ${
              event.type === "error"
                ? "text-red-400"
                : event.type === "success"
                  ? "text-green-400"
                  : event.type === "complete"
                    ? "text-netbird-400 font-medium"
                    : "text-nb-gray-300"
            }`}
          >
            <span className="shrink-0">
              {event.type === "error"
                ? "x"
                : event.type === "success"
                  ? "+"
                  : event.type === "complete"
                    ? "="
                    : "-"}
            </span>
            <span>{event.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
