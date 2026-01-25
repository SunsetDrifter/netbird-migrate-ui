"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/step-indicator";
import { ConnectionForm } from "@/components/connection-form";
import { ImportModal } from "@/components/import-modal";
import { useMigrationState, type ExportedConfig } from "@/hooks/use-migration-state";
import { buildAutoSelection } from "@/lib/build-auto-selection";
import type { SourceResources } from "@/lib/types";

export default function ConnectPage() {
  const router = useRouter();
  const {
    source,
    destination,
    sourceConnected,
    destConnected,
    resources,
    importedSourceUrl,
    importedDestUrl,
    setSource,
    setDestination,
    setSourceConnected,
    setDestConnected,
    setResources,
    setSelection,
    importConfig,
  } = useMigrationState();
  const [exporting, setExporting] = useState(false);
  const [showLimitations, setShowLimitations] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importApplied, setImportApplied] = useState(false);

  const handleSourceConnect = async (token: string, url: string) => {
    const res = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, url }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Connection failed");
    }

    setSource({ token, url });
    setSourceConnected(true);
  };

  const handleSourceDisconnect = () => {
    setSourceConnected(false);
    setSource({ token: "", url: "" });
    setResources(null as never);
    setSelection({
      groups: [],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      dns_settings: [],
      networks: [],
      account_settings: [],
    });
  };

  const handleDestDisconnect = () => {
    setDestConnected(false);
    setDestination({ token: "", url: "" });
  };

  const handleDestConnect = async (token: string, url: string) => {
    if (source && token === source.token && url === source.url) {
      throw new Error("Destination cannot be the same as source");
    }

    const res = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, url }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Connection failed");
    }

    setDestination({ token, url });
    setDestConnected(true);
  };

  const handleExport = async () => {
    if (!source) return;
    setExporting(true);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: source.token, url: source.url }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch resources");
      }
      const data = (await res.json()) as SourceResources;
      const autoSelection = buildAutoSelection(data);
      const config: ExportedConfig = {
        version: 1,
        sourceUrl: source.url,
        destinationUrl: destination?.url || "",
        selection: autoSelection,
        conflicts: [],
        resources: data,
      };
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "netbird-migration-config.json";
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fetch failed silently — button re-enables
    } finally {
      setExporting(false);
    }
  };

  const handleImportComplete = (config: ExportedConfig) => {
    importConfig(config);
    setImportApplied(true);
  };

  const canExport = sourceConnected;
  const canProceed = (sourceConnected || !!resources) && destConnected;

  return (
    <div>
      <StepIndicator currentStep={1} />

      <div className="grid gap-6 md:grid-cols-2">
        <ConnectionForm
          key={`source-${importedSourceUrl}`}
          label="Source Instance"
          defaultUrl={importedSourceUrl || "https://api.netbird.io/api"}
          connected={sourceConnected}
          onConnect={handleSourceConnect}
          onDisconnect={handleSourceDisconnect}
          actionButton={
            <button
              onClick={handleExport}
              disabled={!canExport || exporting}
              className="w-full px-4 py-2 border border-nb-gray-700 text-nb-gray-200 text-sm font-medium rounded-md hover:bg-nb-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? "Fetching..." : "Fetch & Export"}
            </button>
          }
        />
        <ConnectionForm
          key={`dest-${importedDestUrl}`}
          label="Destination Instance"
          defaultUrl={importedDestUrl || "https://api.netbird.io/api"}
          connected={destConnected}
          onConnect={handleDestConnect}
          onDisconnect={handleDestDisconnect}
          actionButton={
            <button
              onClick={() => setImportModalOpen(true)}
              disabled={!destConnected}
              className="w-full px-4 py-2 border border-nb-gray-700 text-nb-gray-200 text-sm font-medium rounded-md hover:bg-nb-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import Config
            </button>
          }
        />
      </div>

      <div className="mt-6 p-4 border border-nb-gray-800 rounded-lg bg-nb-gray-920/50">
        <p className="text-sm text-nb-gray-300">
          <span className="text-nb-gray-100 font-medium">Option 1:</span> Connect both instances above, then select resources and migrate directly.
        </p>
        <p className="text-sm text-nb-gray-300 mt-2">
          <span className="text-nb-gray-100 font-medium">Option 2:</span> Use <span className="text-nb-gray-200">Fetch & Export</span> to save source config to a file, then <span className="text-nb-gray-200">Import Config</span> on a destination instance. Ideal for self-hosted deployments.
        </p>
      </div>

      <div className="mt-4 border border-nb-gray-800 rounded-lg bg-nb-gray-920/50">
        <button
          onClick={() => setShowLimitations(!showLimitations)}
          className="flex items-center justify-between w-full p-4 text-left"
        >
          <h4 className="text-sm font-medium text-netbird-400">Migration Limitations</h4>
          <svg
            className={`w-4 h-4 text-nb-gray-300 transition-transform ${showLimitations ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showLimitations && (
          <div className="px-4 pb-4">
            <p className="text-sm text-nb-gray-300 mb-2">
              This tool migrates configuration only. The following are <span className="text-netbird-400">not transferred</span>:
            </p>
            <ul className="text-sm text-nb-gray-300 space-y-1 list-disc list-inside">
              <li><span className="text-nb-gray-100">Peers</span> — must re-register on destination</li>
              <li><span className="text-nb-gray-100">Users</span> — managed via your identity provider</li>
              <li><span className="text-nb-gray-100">Group memberships</span> — groups are created empty</li>
              <li><span className="text-nb-gray-100">Setup key secrets</span> — new keys generated, must redistribute</li>
              <li><span className="text-nb-gray-100">Personal Access Tokens</span> — must be recreated manually</li>
              <li><span className="text-nb-gray-100">Restrict dashboard for regular users</span> — Settings → Permissions</li>
              <li><span className="text-nb-gray-100">User group propagation</span> — Settings → Groups</li>
            </ul>
          </div>
        )}
      </div>

      {importApplied && (
        <div className="mt-6 border border-green-800 rounded-lg p-4 bg-nb-gray-920 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-green-400 font-medium">Configuration imported successfully</span>
          </div>
          <button
            onClick={() => setImportApplied(false)}
            className="text-nb-gray-400 hover:text-nb-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        {canProceed && (
          <button
            onClick={() => router.push("/migrate")}
            className="px-6 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500"
          >
            Next: Select Resources
          </button>
        )}
      </div>

      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportComplete}
        destination={destination}
        destConnected={destConnected}
      />
    </div>
  );
}
