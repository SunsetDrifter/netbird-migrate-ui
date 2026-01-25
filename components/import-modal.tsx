"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ExportedConfig } from "@/hooks/use-migration-state";
import type { ConnectionConfig, SourceResources, ResourceType, ConflictResolution } from "@/lib/types";

type ImportStep = "load" | "validate" | "preview" | "apply";

interface ValidationLog {
  type: "info" | "success" | "warning" | "error";
  message: string;
}

interface PreviewItem {
  resourceType: ResourceType;
  sourceId: string;
  sourceName: string;
  destinationId?: string;
  status: "create" | "skip" | "overwrite";
}

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (config: ExportedConfig) => void;
  destination: ConnectionConfig | null;
  destConnected: boolean;
}

const stepLabels: { key: ImportStep; label: string }[] = [
  { key: "load", label: "Load" },
  { key: "validate", label: "Validate" },
  { key: "preview", label: "Preview" },
  { key: "apply", label: "Apply" },
];

const resourceTypeLabels: Record<keyof SourceResources, string> = {
  groups: "Groups",
  posture_checks: "Posture Checks",
  policies: "Policies",
  routes: "Routes",
  dns: "DNS Nameservers",
  dns_zones: "DNS Zones",
  networks: "Networks",
  setup_keys: "Setup Keys",
  dns_settings: "DNS Settings",
  account_settings: "Account Settings",
};

function formatDuration(seconds?: number): string {
  if (!seconds) return "not set";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export function ImportModal({ open, onClose, onImport, destination, destConnected }: ImportModalProps) {
  const [step, setStep] = useState<ImportStep>("load");
  const [config, setConfig] = useState<ExportedConfig | null>(null);
  const [logs, setLogs] = useState<ValidationLog[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback((type: ValidationLog["type"], message: string) => {
    setLogs((prev) => [...prev, { type, message }]);
  }, []);

  const resetState = useCallback(() => {
    setStep("load");
    setConfig(null);
    setLogs([]);
    setExpandedSections(new Set());
    setPreviewItems([]);
    setLoadingPreview(false);
    setDragOver(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const handleFileSelect = useCallback((file: File) => {
    setLogs([]);
    addLog("info", `Loading file: ${file.name}`);

    if (file.size > 5242880) {
      addLog("error", "Config file too large (max 5MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as ExportedConfig;

        if (data.version !== 1) {
          addLog("error", `Unsupported config version: ${data.version}`);
          return;
        }

        if (typeof data.sourceUrl !== "string" || typeof data.destinationUrl !== "string") {
          addLog("error", "Invalid config file format: missing required fields");
          return;
        }

        addLog("success", "Config file parsed successfully");

        // Count resources
        if (data.resources) {
          const counts: string[] = [];
          const resources = data.resources;
          if (resources.groups?.length) counts.push(`${resources.groups.length} groups`);
          if (resources.posture_checks?.length) counts.push(`${resources.posture_checks.length} posture checks`);
          if (resources.policies?.length) counts.push(`${resources.policies.length} policies`);
          if (resources.routes?.length) counts.push(`${resources.routes.length} routes`);
          if (resources.dns?.length) counts.push(`${resources.dns.length} DNS nameservers`);
          if (resources.dns_zones?.length) counts.push(`${resources.dns_zones.length} DNS zones`);
          if (resources.networks?.length) counts.push(`${resources.networks.length} networks`);
          if (resources.setup_keys?.length) counts.push(`${resources.setup_keys.length} setup keys`);
          if (resources.dns_settings) counts.push("DNS settings");
          if (resources.account_settings) counts.push("account settings");

          if (counts.length > 0) {
            addLog("info", `Found: ${counts.join(", ")}`);
          }
        }

        // Check source vs destination URL
        if (data.sourceUrl && data.destinationUrl && data.sourceUrl === data.destinationUrl) {
          addLog("warning", "Source URL matches destination URL in config");
        }

        if (data.conflicts?.length) {
          addLog("info", `${data.conflicts.length} conflict resolution(s) saved`);
        }

        setConfig(data);
        setStep("validate");
      } catch (err) {
        addLog("error", err instanceof Error ? err.message : "Failed to parse config file");
      }
    };
    reader.onerror = () => {
      addLog("error", "Failed to read file");
    };
    reader.readAsText(file);
  }, [addLog]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".json")) {
      handleFileSelect(file);
    } else {
      addLog("error", "Please drop a JSON file");
    }
  }, [handleFileSelect, addLog]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = "";
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const fetchPreview = async () => {
    if (!config?.resources || !destination) return;

    setLoadingPreview(true);
    setLogs((prev) => [...prev, { type: "info", message: "Fetching destination resources..." }]);

    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: destination.token, url: destination.url }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch destination resources");
      }

      const destResources = (await res.json()) as SourceResources;
      addLog("success", "Destination resources fetched");

      // Compare resources and build preview
      const items: PreviewItem[] = [];
      const srcRes = config.resources;

      // Helper to check conflicts
      const findDestByName = <T extends { id: string; name: string }>(
        srcItem: T,
        destItems: T[] | undefined
      ): T | undefined => {
        return destItems?.find((d) => d.name.toLowerCase() === srcItem.name.toLowerCase());
      };

      // Groups
      for (const src of srcRes.groups || []) {
        const dest = findDestByName(src, destResources.groups);
        const existingConflict = config.conflicts?.find(
          (c) => c.resourceType === "groups" && c.sourceId === src.id
        );
        items.push({
          resourceType: "groups",
          sourceId: src.id,
          sourceName: src.name,
          destinationId: dest?.id,
          status: dest ? (existingConflict?.resolution === "overwrite" ? "overwrite" : "skip") : "create",
        });
      }

      // Posture checks
      for (const src of srcRes.posture_checks || []) {
        const dest = findDestByName(src, destResources.posture_checks);
        const existingConflict = config.conflicts?.find(
          (c) => c.resourceType === "posture_checks" && c.sourceId === src.id
        );
        items.push({
          resourceType: "posture_checks",
          sourceId: src.id,
          sourceName: src.name,
          destinationId: dest?.id,
          status: dest ? (existingConflict?.resolution === "overwrite" ? "overwrite" : "skip") : "create",
        });
      }

      // Policies
      for (const src of srcRes.policies || []) {
        const dest = findDestByName(src, destResources.policies);
        const existingConflict = config.conflicts?.find(
          (c) => c.resourceType === "policies" && c.sourceId === src.id
        );
        items.push({
          resourceType: "policies",
          sourceId: src.id,
          sourceName: src.name,
          destinationId: dest?.id,
          status: dest ? (existingConflict?.resolution === "overwrite" ? "overwrite" : "skip") : "create",
        });
      }

      // Routes
      for (const src of srcRes.routes || []) {
        const dest = destResources.routes?.find(
          (d) => d.name.toLowerCase() === src.name.toLowerCase()
        );
        const existingConflict = config.conflicts?.find(
          (c) => c.resourceType === "routes" && c.sourceId === src.id
        );
        items.push({
          resourceType: "routes",
          sourceId: src.id,
          sourceName: src.name,
          destinationId: dest?.id,
          status: dest ? (existingConflict?.resolution === "overwrite" ? "overwrite" : "skip") : "create",
        });
      }

      // DNS Nameservers
      for (const src of srcRes.dns || []) {
        const dest = destResources.dns?.find(
          (d) => d.name.toLowerCase() === src.name.toLowerCase()
        );
        const existingConflict = config.conflicts?.find(
          (c) => c.resourceType === "dns" && c.sourceId === src.id
        );
        items.push({
          resourceType: "dns",
          sourceId: src.id,
          sourceName: src.name,
          destinationId: dest?.id,
          status: dest ? (existingConflict?.resolution === "overwrite" ? "overwrite" : "skip") : "create",
        });
      }

      // DNS Zones
      for (const src of srcRes.dns_zones || []) {
        const dest = destResources.dns_zones?.find(
          (d) => d.name.toLowerCase() === src.name.toLowerCase()
        );
        const existingConflict = config.conflicts?.find(
          (c) => c.resourceType === "dns_zones" && c.sourceId === src.id
        );
        items.push({
          resourceType: "dns_zones",
          sourceId: src.id,
          sourceName: src.name,
          destinationId: dest?.id,
          status: dest ? (existingConflict?.resolution === "overwrite" ? "overwrite" : "skip") : "create",
        });
      }

      // Networks
      for (const src of srcRes.networks || []) {
        const dest = destResources.networks?.find(
          (d) => d.name.toLowerCase() === src.name.toLowerCase()
        );
        const existingConflict = config.conflicts?.find(
          (c) => c.resourceType === "networks" && c.sourceId === src.id
        );
        items.push({
          resourceType: "networks",
          sourceId: src.id,
          sourceName: src.name,
          destinationId: dest?.id,
          status: dest ? (existingConflict?.resolution === "overwrite" ? "overwrite" : "skip") : "create",
        });
      }

      // Setup keys
      for (const src of srcRes.setup_keys || []) {
        const dest = destResources.setup_keys?.find(
          (d) => d.name.toLowerCase() === src.name.toLowerCase()
        );
        items.push({
          resourceType: "setup_keys",
          sourceId: src.id,
          sourceName: src.name,
          destinationId: dest?.id,
          status: dest ? "skip" : "create",
        });
      }

      setPreviewItems(items);

      const createCount = items.filter((i) => i.status === "create").length;
      const skipCount = items.filter((i) => i.status === "skip").length;
      const overwriteCount = items.filter((i) => i.status === "overwrite").length;

      addLog("success", `Preview: ${createCount} to create, ${skipCount} to skip, ${overwriteCount} to overwrite`);
      setStep("preview");
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : "Failed to fetch destination resources");
    } finally {
      setLoadingPreview(false);
    }
  };

  const updatePreviewItemStatus = (sourceId: string, resourceType: ResourceType, status: "skip" | "overwrite") => {
    setPreviewItems((prev) =>
      prev.map((item) =>
        item.sourceId === sourceId && item.resourceType === resourceType
          ? { ...item, status }
          : item
      )
    );
  };

  const handleApply = () => {
    if (!config) return;

    // Build updated conflicts from preview items
    const updatedConflicts = previewItems
      .filter((item) => item.destinationId && (item.status === "skip" || item.status === "overwrite"))
      .map((item) => ({
        resourceType: item.resourceType,
        sourceId: item.sourceId,
        sourceName: item.sourceName,
        destinationId: item.destinationId!,
        resolution: item.status as ConflictResolution,
      }));

    const updatedConfig: ExportedConfig = {
      ...config,
      conflicts: updatedConflicts,
    };

    onImport(updatedConfig);
    addLog("success", "Configuration imported successfully");
    onClose();
  };

  const handleNext = () => {
    if (step === "validate") {
      if (destConnected) {
        fetchPreview();
      } else {
        setStep("apply");
      }
    } else if (step === "preview") {
      setStep("apply");
    }
  };

  const handleBack = () => {
    if (step === "validate") {
      setStep("load");
      setConfig(null);
      setLogs([]);
    } else if (step === "preview") {
      setStep("validate");
    } else if (step === "apply") {
      if (destConnected && previewItems.length > 0) {
        setStep("preview");
      } else {
        setStep("validate");
      }
    }
  };

  const getStepIndex = (s: ImportStep) => stepLabels.findIndex((sl) => sl.key === s);
  const currentStepIndex = getStepIndex(step);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] bg-nb-gray-920 border border-nb-gray-800 rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-nb-gray-800">
          <h2 className="text-lg font-semibold text-nb-gray-100">Import Configuration</h2>
          <button
            onClick={onClose}
            className="p-1 text-nb-gray-300 hover:text-nb-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 px-6 py-4 border-b border-nb-gray-800 bg-nb-gray-900/50">
          {stepLabels.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                  i < currentStepIndex
                    ? "bg-green-500 text-white"
                    : i === currentStepIndex
                      ? "bg-netbird-400 text-white"
                      : "bg-nb-gray-700 text-nb-gray-500"
                }`}
              >
                {i < currentStepIndex ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-sm ${
                  i === currentStepIndex ? "font-medium text-nb-gray-100" : "text-nb-gray-500"
                }`}
              >
                {s.label}
              </span>
              {i < stepLabels.length - 1 && (
                <div className={`w-8 h-0.5 ${i < currentStepIndex ? "bg-green-500" : "bg-nb-gray-700"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: Load */}
          {step === "load" && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragOver
                    ? "border-netbird-400 bg-netbird-400/10"
                    : "border-nb-gray-700 hover:border-nb-gray-600"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <svg
                  className="w-12 h-12 mx-auto text-nb-gray-500 mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-nb-gray-300 mb-2">Drag and drop your config file here</p>
                <p className="text-nb-gray-500 text-sm mb-4">or</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-nb-gray-800 text-nb-gray-200 text-sm font-medium rounded-md hover:bg-nb-gray-700 transition-colors"
                >
                  Browse Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleInputChange}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-nb-gray-500 text-center">
                Accepts JSON files exported from NetBird Migration Tool (max 5MB)
              </p>
            </div>
          )}

          {/* Step 2: Validate */}
          {step === "validate" && config && (
            <div className="space-y-4">
              <div className="p-4 bg-nb-gray-900 rounded-lg border border-nb-gray-800">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-nb-gray-500">Source:</span>
                    <p className="text-nb-gray-200 truncate">{config.sourceUrl || "—"}</p>
                  </div>
                  <div>
                    <span className="text-nb-gray-500">Destination:</span>
                    <p className="text-nb-gray-200 truncate">{config.destinationUrl || "—"}</p>
                  </div>
                </div>
                {config.sourceUrl && destination?.url && config.sourceUrl === destination.url && (
                  <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <span>Source URL matches connected destination</span>
                  </div>
                )}
              </div>

              {config.resources && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-nb-gray-200">Resources to Import</h4>
                  {(Object.keys(resourceTypeLabels) as (keyof SourceResources)[])
                    .filter((key) => key !== "setup_keys")
                    .map((key) => {
                    const items = config.resources?.[key];
                    if (!items) return null;
                    const isArray = Array.isArray(items);
                    const count = isArray ? items.length : 1;
                    if (count === 0) return null;

                    const isExpanded = expandedSections.has(key);

                    return (
                      <div key={key} className="border border-nb-gray-800 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleSection(key)}
                          className="flex items-center justify-between w-full px-4 py-2 text-left bg-nb-gray-900 hover:bg-nb-gray-850 transition-colors"
                        >
                          <span className="text-sm text-nb-gray-200">
                            {resourceTypeLabels[key]} ({count})
                          </span>
                          <svg
                            className={`w-4 h-4 text-nb-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isExpanded && isArray && (
                          <div className="px-4 py-2 space-y-1 bg-nb-gray-950 max-h-40 overflow-y-auto">
                            {(items as { name: string; id: string }[]).map((item) => (
                              <div key={item.id} className="text-sm text-nb-gray-300 flex items-center gap-2">
                                <span className="text-nb-gray-500">•</span>
                                <span>{item.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {isExpanded && !isArray && key === "dns_settings" && config.resources?.dns_settings && (
                          <div className="px-4 py-2 bg-nb-gray-950 space-y-1">
                            <p className="text-sm text-nb-gray-300">
                              Groups with disabled DNS management: {config.resources.dns_settings.disabled_management_groups?.length || 0}
                            </p>
                            <p className="text-xs text-nb-gray-500">
                              Controls which peer groups have DNS management disabled
                            </p>
                          </div>
                        )}
                        {isExpanded && !isArray && key === "account_settings" && config.resources?.account_settings && (() => {
                          const s = config.resources.account_settings;
                          const hasSettings = s.peer_login_expiration_enabled || s.peer_inactivity_expiration_enabled ||
                            s.extra?.peer_approval_enabled || s.dns_domain || s.routing_peer_dns_resolution_enabled ||
                            s.lazy_connection_enabled;
                          return (
                            <div className="px-4 py-2 bg-nb-gray-950 space-y-1">
                              {hasSettings ? (
                                <ul className="text-sm text-nb-gray-300 space-y-0.5">
                                  {s.peer_login_expiration_enabled && (
                                    <li>• Peer login expiration: {formatDuration(s.peer_login_expiration)}</li>
                                  )}
                                  {s.peer_inactivity_expiration_enabled && (
                                    <li>• Peer inactivity expiration: {formatDuration(s.peer_inactivity_expiration)}</li>
                                  )}
                                  {s.extra?.peer_approval_enabled && <li>• Peer approval enabled</li>}
                                  {s.dns_domain && <li>• DNS domain: {s.dns_domain}</li>}
                                  {s.routing_peer_dns_resolution_enabled && <li>• Routing peer DNS resolution enabled</li>}
                                  {s.lazy_connection_enabled && <li>• Lazy connection enabled</li>}
                                </ul>
                              ) : (
                                <p className="text-sm text-nb-gray-300">Account settings included</p>
                              )}
                              <p className="text-xs text-amber-400 mt-2">
                                Not migrated: Dashboard restrictions, User group propagation
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Not Migrated Section */}
              {config.resources && (
                <div className="mt-4 p-3 bg-nb-gray-900/50 rounded-lg border border-amber-500/30">
                  <h4 className="text-sm font-medium text-amber-400 mb-2">Not Migrated</h4>
                  <ul className="text-sm text-nb-gray-300 space-y-1.5">
                    {config.resources.setup_keys && config.resources.setup_keys.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="text-amber-500">•</span>
                        <span>
                          <span className="text-nb-gray-200">Setup Keys</span>
                          <span className="text-nb-gray-500"> — new keys generated, must redistribute</span>
                          <span className="text-nb-gray-500 text-xs block">
                            ({config.resources.setup_keys.map((k) => k.name).join(", ")})
                          </span>
                        </span>
                      </li>
                    )}
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500">•</span>
                      <span>
                        <span className="text-nb-gray-200">Dashboard restrictions</span>
                        <span className="text-nb-gray-500"> — Settings → Permissions</span>
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500">•</span>
                      <span>
                        <span className="text-nb-gray-200">User group propagation</span>
                        <span className="text-nb-gray-500"> — Settings → Groups</span>
                      </span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && (
            <div className="space-y-4">
              <p className="text-sm text-nb-gray-300">
                Compared resources with destination. Adjust conflict resolutions below:
              </p>

              {/* Will Create */}
              {previewItems.filter((i) => i.status === "create").length > 0 && (
                <div className="border border-nb-gray-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-nb-gray-900 flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-sm font-medium text-green-400">
                      Will Create ({previewItems.filter((i) => i.status === "create").length})
                    </span>
                  </div>
                  <div className="px-4 py-2 space-y-1 bg-nb-gray-950 max-h-32 overflow-y-auto">
                    {previewItems
                      .filter((i) => i.status === "create")
                      .map((item) => (
                        <div key={`${item.resourceType}-${item.sourceId}`} className="text-sm text-nb-gray-300 flex items-center gap-2">
                          <span className="text-green-500">+</span>
                          <span className="text-nb-gray-500">{resourceTypeLabels[item.resourceType as keyof SourceResources] || item.resourceType}:</span>
                          <span>{item.sourceName}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Conflicts - Skip */}
              {previewItems.filter((i) => i.status === "skip").length > 0 && (
                <div className="border border-nb-gray-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-nb-gray-900 flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-amber-400">
                      Exists - Will Skip ({previewItems.filter((i) => i.status === "skip").length})
                    </span>
                  </div>
                  <div className="px-4 py-2 space-y-2 bg-nb-gray-950 max-h-40 overflow-y-auto">
                    {previewItems
                      .filter((i) => i.status === "skip")
                      .map((item) => (
                        <div key={`${item.resourceType}-${item.sourceId}`} className="flex items-center justify-between">
                          <div className="text-sm text-nb-gray-300 flex items-center gap-2">
                            <span className="text-amber-500">~</span>
                            <span className="text-nb-gray-500">{resourceTypeLabels[item.resourceType as keyof SourceResources] || item.resourceType}:</span>
                            <span>{item.sourceName}</span>
                          </div>
                          <button
                            onClick={() => updatePreviewItemStatus(item.sourceId, item.resourceType, "overwrite")}
                            className="text-xs px-2 py-1 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                          >
                            Overwrite
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Conflicts - Overwrite */}
              {previewItems.filter((i) => i.status === "overwrite").length > 0 && (
                <div className="border border-nb-gray-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-nb-gray-900 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    <span className="text-sm font-medium text-blue-400">
                      Will Overwrite ({previewItems.filter((i) => i.status === "overwrite").length})
                    </span>
                  </div>
                  <div className="px-4 py-2 space-y-2 bg-nb-gray-950 max-h-40 overflow-y-auto">
                    {previewItems
                      .filter((i) => i.status === "overwrite")
                      .map((item) => (
                        <div key={`${item.resourceType}-${item.sourceId}`} className="flex items-center justify-between">
                          <div className="text-sm text-nb-gray-300 flex items-center gap-2">
                            <span className="text-blue-500">↻</span>
                            <span className="text-nb-gray-500">{resourceTypeLabels[item.resourceType as keyof SourceResources] || item.resourceType}:</span>
                            <span>{item.sourceName}</span>
                          </div>
                          <button
                            onClick={() => updatePreviewItemStatus(item.sourceId, item.resourceType, "skip")}
                            className="text-xs px-2 py-1 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Apply */}
          {step === "apply" && config && (
            <div className="space-y-4">
              <div className="p-4 bg-nb-gray-900 rounded-lg border border-nb-gray-800">
                <h4 className="text-sm font-medium text-nb-gray-200 mb-3">Ready to Import</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-nb-gray-500">Source:</span>
                    <p className="text-nb-gray-200 truncate">{config.sourceUrl || "—"}</p>
                  </div>
                  <div>
                    <span className="text-nb-gray-500">Destination:</span>
                    <p className="text-nb-gray-200 truncate">{config.destinationUrl || "—"}</p>
                  </div>
                </div>

                {previewItems.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-nb-gray-800">
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="text-green-400">+</span>
                        <span className="text-nb-gray-300">Create:</span>
                        <span className="text-nb-gray-200">{previewItems.filter((i) => i.status === "create").length}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-400">~</span>
                        <span className="text-nb-gray-300">Skip:</span>
                        <span className="text-nb-gray-200">{previewItems.filter((i) => i.status === "skip").length}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-blue-400">↻</span>
                        <span className="text-nb-gray-300">Overwrite:</span>
                        <span className="text-nb-gray-200">{previewItems.filter((i) => i.status === "overwrite").length}</span>
                      </div>
                    </div>
                  </div>
                )}

                {!destConnected && previewItems.length === 0 && config.resources && (
                  <div className="mt-4 pt-4 border-t border-nb-gray-800">
                    <p className="text-sm text-nb-gray-300">
                      {Object.entries(config.resources).reduce((acc, [, val]) => {
                        if (Array.isArray(val)) return acc + val.length;
                        if (val) return acc + 1;
                        return acc;
                      }, 0)}{" "}
                      resources will be loaded into selection
                    </p>
                    <p className="text-xs text-nb-gray-500 mt-1">
                      Conflict detection will happen when you proceed to migration
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm text-green-400">
                  Click Apply to import this configuration. You can then proceed to the Select Resources step.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Log Panel */}
        {logs.length > 0 && (
          <div className="border-t border-nb-gray-800">
            <div className="bg-nb-gray-900 px-4 py-2 flex items-center gap-2">
              <h4 className="text-xs font-medium text-nb-gray-300">Import Log</h4>
            </div>
            <div className="max-h-32 overflow-y-auto px-4 py-2 bg-nb-gray-950 space-y-0.5 font-mono text-xs">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 ${
                    log.type === "error"
                      ? "text-red-400"
                      : log.type === "success"
                        ? "text-green-400"
                        : log.type === "warning"
                          ? "text-amber-400"
                          : "text-nb-gray-300"
                  }`}
                >
                  <span className="shrink-0">
                    {log.type === "error" ? "x" : log.type === "success" ? "+" : log.type === "warning" ? "!" : "-"}
                  </span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-nb-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-nb-gray-300 hover:text-nb-gray-100 transition-colors"
          >
            Cancel
          </button>
          {step !== "load" && (
            <button
              onClick={handleBack}
              className="px-4 py-2 border border-nb-gray-700 text-nb-gray-200 text-sm font-medium rounded-md hover:bg-nb-gray-800 transition-colors"
            >
              Back
            </button>
          )}
          {step === "validate" && (
            <button
              onClick={handleNext}
              disabled={loadingPreview}
              className="px-4 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingPreview ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading...
                </span>
              ) : destConnected ? (
                "Preview"
              ) : (
                "Continue"
              )}
            </button>
          )}
          {step === "preview" && (
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500 transition-colors"
            >
              Continue
            </button>
          )}
          {step === "apply" && (
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500 transition-colors"
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
