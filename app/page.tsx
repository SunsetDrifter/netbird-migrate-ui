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
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
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

      <div className="mb-6 p-4 border border-nb-gray-800 rounded-lg bg-nb-gray-920/50">
        <p className="text-sm text-nb-gray-200 font-medium mb-1">
          How to migrate your NetBird configuration
        </p>
        <ol className="text-sm text-nb-gray-300 list-decimal list-inside space-y-1">
          <li>
            In each NetBird dashboard, open{" "}
            <span className="text-nb-gray-100">Team → Service Users</span>, click{" "}
            <span className="text-nb-gray-100">Create Service User</span> with the{" "}
            <span className="text-nb-gray-100">Admin</span> role, then{" "}
            <span className="text-nb-gray-100">Create Access Token</span> and copy it.
          </li>
          <li>
            Paste each token and its management URL into the matching card below, then click{" "}
            <span className="text-nb-gray-100">Connect</span>. The cloud URL is{" "}
            <span className="text-nb-gray-100">https://api.netbird.io/api</span>; self-hosted instances use{" "}
            <span className="text-nb-gray-100">https://&lt;your-host&gt;/api</span>.
          </li>
          <li>
            Once both are connected, click{" "}
            <span className="text-nb-gray-100">Next: Select Resources</span> to choose what to copy. Nothing is written to the destination until you confirm on the final step.
          </li>
        </ol>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ConnectionForm
          key={`source-${importedSourceUrl}`}
          label="Source Instance"
          defaultUrl={importedSourceUrl || "https://api.netbird.io/api"}
          connected={sourceConnected}
          onConnect={handleSourceConnect}
          onDisconnect={handleSourceDisconnect}
          testId="source-card"
        />
        <ConnectionForm
          key={`dest-${importedDestUrl}`}
          label="Destination Instance"
          defaultUrl={importedDestUrl || "https://api.netbird.io/api"}
          connected={destConnected}
          onConnect={handleDestConnect}
          onDisconnect={handleDestDisconnect}
          testId="dest-card"
        />
      </div>

      <div className="mt-6 border border-nb-gray-800 rounded-lg p-6 bg-nb-gray-920">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-lg font-medium text-nb-gray-100">
            Offline workflow
          </h3>
          <span className="text-xs text-nb-gray-500 mt-1">
            Alternative to direct migration
          </span>
        </div>
        <p className="text-sm text-nb-gray-300 mb-4">
          Save the source configuration to a JSON file, then apply it to a
          destination on a different network. Useful for self-hosted instances
          that aren&apos;t reachable from the same machine.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <button
              onClick={handleExport}
              disabled={!canExport || exporting}
              className="px-3 py-1.5 border border-nb-gray-700 text-nb-gray-200 text-sm rounded-md hover:bg-nb-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? "Fetching..." : "Fetch & Export"}
            </button>
            <p className="mt-2 text-xs text-nb-gray-500">
              {canExport
                ? "Downloads source config as JSON."
                : "Connect the source instance first."}
            </p>
          </div>
          <div>
            <button
              onClick={() => setImportModalOpen(true)}
              disabled={!destConnected}
              className="px-3 py-1.5 border border-nb-gray-700 text-nb-gray-200 text-sm rounded-md hover:bg-nb-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import Config
            </button>
            <p className="mt-2 text-xs text-nb-gray-500">
              {destConnected
                ? "Loads a previously exported JSON file."
                : "Connect the destination instance first."}
            </p>
          </div>
        </div>
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
              <li><span className="text-nb-gray-100">Ephemeral Reverse Proxy services</span> — CLI-exposed services are skipped (they're short-lived)</li>
              <li><span className="text-nb-gray-100">Reverse Proxy across platforms</span> — domains/services are pinned to a specific cluster, so they can&apos;t move between self-hosted and cloud</li>
              <li><span className="text-nb-gray-100">Reverse Proxy TLS certificates</span> — managed by the destination cluster, not migrated</li>
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
