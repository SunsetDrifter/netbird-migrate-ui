"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/step-indicator";
import { ResourceList } from "@/components/resource-list";
import { useMigrationState } from "@/hooks/use-migration-state";
import { buildAutoSelection } from "@/lib/build-auto-selection";
import type { ResourceSelection, SourceResources } from "@/lib/types";

export default function SelectPage() {
  const router = useRouter();
  const {
    source,
    sourceConnected,
    destConnected,
    resources,
    selection,
    setResources,
    setSelection,
  } = useMigrationState();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const hasFetched = useRef(false);

  const fetchResources = useCallback(async (opts?: { preserveSelection?: boolean }) => {
    if (!source) return;

    const isRefresh = opts?.preserveSelection;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

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
      const data = await res.json() as SourceResources;
      setResources(data);

      const allValid = buildAutoSelection(data);
      if (isRefresh) {
        // Preserve deselections: intersect previous selection with new valid IDs
        const currentSelection = selectionRef.current;
        const reconciled: ResourceSelection = {} as ResourceSelection;
        for (const key of Object.keys(allValid) as (keyof ResourceSelection)[]) {
          const validIds = new Set(allValid[key]);
          reconciled[key] = currentSelection[key].filter((id) => validIds.has(id));
        }
        setSelection(reconciled);
      } else {
        setSelection(allValid);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch resources");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [source, setResources, setSelection]);

  useEffect(() => {
    if ((!sourceConnected && !resources) || !destConnected) {
      router.push("/");
      return;
    }

    if (!resources && source && !hasFetched.current) {
      hasFetched.current = true;
      fetchResources();
    }
  }, [source, sourceConnected, destConnected, resources, router, fetchResources]);

  const updateSelection = (key: keyof ResourceSelection, ids: string[]) => {
    setSelection({ ...selection, [key]: ids });
  };

  const totalSelected = Object.values(selection).reduce(
    (sum, ids) => sum + ids.length,
    0
  );

  if (loading) {
    return (
      <div>
        <StepIndicator currentStep={2} />
        <div className="text-center py-12">
          <svg className="animate-spin h-8 w-8 text-netbird-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-nb-gray-300">Loading resources from source...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <StepIndicator currentStep={2} />
        <div className="text-center py-12">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-netbird-400 hover:text-netbird-300"
          >
            Back to connection setup
          </button>
        </div>
      </div>
    );
  }

  if (!resources) return null;

  return (
    <div>
      <StepIndicator currentStep={2} />

      {sourceConnected && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => fetchResources({ preserveSelection: true })}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-nb-gray-300 hover:text-nb-gray-100 border border-nb-gray-700 rounded-md hover:border-nb-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      )}

      <div className="space-y-4">
        <ResourceList
          title="Groups"
          items={resources.groups
            .filter((g) => g.name.toLowerCase() !== "all")
            .map((g) => ({
              id: g.id,
              name: g.name,
              subtitle: `${g.peers_count} peers`,
            }))}
          selectedIds={selection.groups}
          onSelectionChange={(ids) => updateSelection("groups", ids)}
        />

        <ResourceList
          title="Posture Checks"
          items={resources.posture_checks.map((p) => ({
            id: p.id,
            name: p.name,
            subtitle: p.description || undefined,
          }))}
          selectedIds={selection.posture_checks}
          onSelectionChange={(ids) => updateSelection("posture_checks", ids)}
        />

        <ResourceList
          title="Policies"
          items={resources.policies.map((p) => ({
            id: p.id,
            name: p.name,
            subtitle: `${p.rules.length} rule${p.rules.length !== 1 ? "s" : ""} - ${p.enabled ? "enabled" : "disabled"}`,
          }))}
          selectedIds={selection.policies}
          onSelectionChange={(ids) => updateSelection("policies", ids)}
        />

        <ResourceList
          title="Network Routes"
          items={resources.routes.map((r) => ({
            id: r.id,
            name: r.name,
            subtitle: r.network || r.domains?.join(", ") || undefined,
          }))}
          selectedIds={selection.routes}
          onSelectionChange={(ids) => updateSelection("routes", ids)}
        />

        <ResourceList
          title="DNS Nameserver Groups"
          items={resources.dns.map((d) => ({
            id: d.id,
            name: d.name,
            subtitle: d.nameservers.map((ns) => ns.ip).join(", "),
          }))}
          selectedIds={selection.dns}
          onSelectionChange={(ids) => updateSelection("dns", ids)}
        />

        {(resources.dns_zones || []).length > 0 && (
          <ResourceList
            title="DNS Zones"
            items={(resources.dns_zones || []).map((z) => ({
              id: z.id,
              name: z.name,
              subtitle: z.domain,
            }))}
            selectedIds={selection.dns_zones}
            onSelectionChange={(ids) => updateSelection("dns_zones", ids)}
          />
        )}

        {resources.dns_settings?.disabled_management_groups?.length ? (
          <ResourceList
            title="DNS Settings"
            items={[{
              id: "disabled_management_groups",
              name: "Disabled Management Groups",
              subtitle: `${resources.dns_settings.disabled_management_groups.length} group(s)`,
            }]}
            selectedIds={selection.dns_settings}
            onSelectionChange={(ids) => updateSelection("dns_settings", ids)}
          />
        ) : null}

        <ResourceList
          title="Networks"
          items={resources.networks.map((n) => ({
            id: n.id,
            name: n.name,
            subtitle: n.description || undefined,
          }))}
          selectedIds={selection.networks}
          onSelectionChange={(ids) => updateSelection("networks", ids)}
        />

        <ResourceList
          title="Setup Keys"
          items={resources.setup_keys
            .filter((k) => k.valid && !k.revoked)
            .map((k) => ({
              id: k.id,
              name: k.name,
              subtitle: `${k.type} - used ${k.used_times} times`,
            }))}
          selectedIds={selection.setup_keys}
          onSelectionChange={(ids) => updateSelection("setup_keys", ids)}
        />

        {resources.account_settings && (() => {
          const s = resources.account_settings;
          const items: { id: string; name: string; subtitle: string }[] = [];
          if (s.peer_login_expiration_enabled !== undefined) {
            const days = Math.round((s.peer_login_expiration || 0) / 86400);
            items.push({
              id: "peer_login_expiration",
              name: "Peer Session Expiration",
              subtitle: s.peer_login_expiration_enabled ? `Enabled, ${days} day${days !== 1 ? "s" : ""}` : "Disabled",
            });
          }
          if (s.peer_inactivity_expiration_enabled !== undefined) {
            const mins = Math.round((s.peer_inactivity_expiration || 0) / 60);
            items.push({
              id: "peer_inactivity_expiration",
              name: "Peer Inactivity Expiration",
              subtitle: s.peer_inactivity_expiration_enabled ? `Enabled, ${mins} min` : "Disabled",
            });
          }
          if (s.extra?.peer_approval_enabled !== undefined) {
            items.push({
              id: "peer_approval",
              name: "Peer Approval",
              subtitle: s.extra.peer_approval_enabled ? "Enabled" : "Disabled",
            });
          }
          if (s.extra?.user_approval_required !== undefined) {
            items.push({
              id: "user_approval",
              name: "User Approval Required",
              subtitle: s.extra.user_approval_required ? "Enabled" : "Disabled",
            });
          }
          if (items.length === 0) return null;
          return (
            <ResourceList
              title="Authentication Settings"
              items={items}
              selectedIds={selection.account_settings}
              onSelectionChange={(ids) => updateSelection("account_settings", ids)}
            />
          );
        })()}

        {resources.account_settings && (() => {
          const s = resources.account_settings;
          const items: { id: string; name: string; subtitle: string }[] = [];
          if (s.dns_domain) {
            items.push({
              id: "dns_domain",
              name: "DNS Domain",
              subtitle: s.dns_domain,
            });
          }
          if (s.network_range) {
            items.push({
              id: "network_range",
              name: "Network Range",
              subtitle: s.network_range,
            });
          }
          if (items.length === 0) return null;
          return (
            <ResourceList
              title="Network Settings"
              items={items}
              selectedIds={selection.account_settings}
              onSelectionChange={(ids) => updateSelection("account_settings", ids)}
            />
          );
        })()}

        {resources.account_settings && (() => {
          const s = resources.account_settings;
          const items: { id: string; name: string; subtitle: string }[] = [];
          if (s.auto_update_version !== undefined) {
            const v = s.auto_update_version;
            const display = v === "latest" ? "Latest" : v === "disabled" ? "Disabled" : v;
            items.push({
              id: "auto_update_version",
              name: "Automatic Updates",
              subtitle: display,
            });
          }
          if (s.lazy_connection_enabled !== undefined) {
            items.push({
              id: "lazy_connection_enabled",
              name: "Lazy Connections",
              subtitle: s.lazy_connection_enabled ? "Enabled" : "Disabled",
            });
          }
          if (items.length === 0) return null;
          return (
            <ResourceList
              title="Client Settings"
              items={items}
              selectedIds={selection.account_settings}
              onSelectionChange={(ids) => updateSelection("account_settings", ids)}
            />
          );
        })()}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 text-sm text-nb-gray-300 hover:text-nb-gray-100"
        >
          Back
        </button>
        <div className="flex items-center gap-4">
          <span className="text-sm text-nb-gray-500">
            {totalSelected} resource{totalSelected !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={() => router.push("/migrate/execute")}
            disabled={totalSelected === 0}
            className="px-6 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next: Migrate
          </button>
        </div>
      </div>
    </div>
  );
}
