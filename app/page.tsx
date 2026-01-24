"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/step-indicator";
import { ConnectionForm } from "@/components/connection-form";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<ExportedConfig | null>(null);
  const [appliedImport, setAppliedImport] = useState<ExportedConfig | null>(null);

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
      setup_keys: [],
      account_settings: [],
    });
  };

  const handleDestDisconnect = () => {
    setDestConnected(false);
    setDestination({ token: "", url: "" });
  };

  const handleDestConnect = async (token: string, url: string) => {
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

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5242880) {
      setImportError("Config file too large (max 5MB)");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as ExportedConfig;
        if (data.version !== 1 || typeof data.sourceUrl !== "string" || typeof data.destinationUrl !== "string") {
          throw new Error("Invalid config file format");
        }
        setPendingImport(data);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Failed to parse config file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleConfirmImport = () => {
    if (pendingImport) {
      importConfig(pendingImport);
      setAppliedImport(pendingImport);
      setPendingImport(null);
    }
  };

  const handleCancelImport = () => {
    setPendingImport(null);
  };

  const handleDismissApplied = () => {
    setAppliedImport(null);
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
        />
        <ConnectionForm
          key={`dest-${importedDestUrl}`}
          label="Destination Instance"
          defaultUrl={importedDestUrl || "https://api.netbird.io/api"}
          connected={destConnected}
          onConnect={handleDestConnect}
          onDisconnect={handleDestDisconnect}
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={!canExport || exporting}
            className="px-4 py-2 border border-nb-gray-700 text-nb-gray-200 text-sm font-medium rounded-md hover:bg-nb-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? "Fetching..." : "Fetch & Export"}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 border border-nb-gray-700 text-nb-gray-200 text-sm font-medium rounded-md hover:bg-nb-gray-800"
          >
            Import Config
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          {importError && (
            <span className="text-sm text-red-400">{importError}</span>
          )}
        </div>

        {canProceed && (
          <button
            onClick={() => router.push("/migrate")}
            className="px-6 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500"
          >
            Next: Select Resources
          </button>
        )}
      </div>

      {pendingImport && (
        <div className="mt-6 border border-nb-gray-800 rounded-lg p-6 bg-nb-gray-920">
          <h3 className="text-sm font-medium text-nb-gray-100 mb-4">Import Summary</h3>
          <div className="space-y-2 text-sm text-nb-gray-300">
            <p><span className="text-nb-gray-400">Source:</span> {pendingImport.sourceUrl || "—"}</p>
            <p><span className="text-nb-gray-400">Destination:</span> {pendingImport.destinationUrl || "—"}</p>

            {Object.entries(pendingImport.selection).some(([, ids]) => ids.length > 0) && (
              <div className="pt-2">
                <p className="text-nb-gray-400 mb-1">Selections:</p>
                <ul className="list-none space-y-0.5 pl-2">
                  {Object.entries(pendingImport.selection)
                    .filter(([, ids]) => ids.length > 0)
                    .map(([type, ids]) => (
                      <li key={type}>{type.replace(/_/g, " ")}: {ids.length}</li>
                    ))}
                </ul>
              </div>
            )}

            {pendingImport.conflicts.length > 0 && (
              <div className="pt-2">
                <p className="text-nb-gray-400 mb-1">
                  Conflicts: {pendingImport.conflicts.length} ({pendingImport.conflicts.filter(c => c.resolution === "skip").length} skip, {pendingImport.conflicts.filter(c => c.resolution === "overwrite").length} overwrite)
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={handleConfirmImport}
              className="px-4 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500"
            >
              Apply
            </button>
            <button
              onClick={handleCancelImport}
              className="px-4 py-2 border border-nb-gray-700 text-nb-gray-200 text-sm font-medium rounded-md hover:bg-nb-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {appliedImport && !pendingImport && (
        <div className="mt-6 border border-green-800 rounded-lg p-6 bg-nb-gray-920">
          <h3 className="text-sm font-medium text-green-400 mb-4">Config Imported</h3>
          <div className="space-y-2 text-sm text-nb-gray-300">
            <p><span className="text-nb-gray-400">Source:</span> {appliedImport.sourceUrl || "—"}</p>
            <p><span className="text-nb-gray-400">Destination:</span> {appliedImport.destinationUrl || "—"}</p>

            {Object.entries(appliedImport.selection).some(([, ids]) => ids.length > 0) && (
              <div className="pt-2">
                <p className="text-nb-gray-400 mb-1">Selections:</p>
                <ul className="list-none space-y-0.5 pl-2">
                  {Object.entries(appliedImport.selection)
                    .filter(([, ids]) => ids.length > 0)
                    .map(([type, ids]) => (
                      <li key={type}>{type.replace(/_/g, " ")}: {ids.length}</li>
                    ))}
                </ul>
              </div>
            )}

            {appliedImport.conflicts.length > 0 && (
              <div className="pt-2">
                <p className="text-nb-gray-400 mb-1">
                  Conflicts: {appliedImport.conflicts.length} ({appliedImport.conflicts.filter(c => c.resolution === "skip").length} skip, {appliedImport.conflicts.filter(c => c.resolution === "overwrite").length} overwrite)
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-3">
            {destConnected && (
              <button
                onClick={() => importConfig(appliedImport!)}
                className="px-4 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500"
              >
                Re-apply Config
              </button>
            )}
            <button
              onClick={handleDismissApplied}
              className="px-4 py-2 border border-nb-gray-700 text-nb-gray-200 text-sm font-medium rounded-md hover:bg-nb-gray-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
