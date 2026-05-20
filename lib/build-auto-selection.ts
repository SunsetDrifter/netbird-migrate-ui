import type { ResourceSelection, SourceResources } from "@/lib/types";
import { isCrossPlatformMigration } from "@/lib/platform";

export interface AutoSelectionContext {
  sourceUrl?: string | null;
  destUrl?: string | null;
}

export function buildAutoSelection(
  data: SourceResources,
  ctx: AutoSelectionContext = {}
): ResourceSelection {
  const authSettingIds: string[] = [];
  if (data.account_settings) {
    const s = data.account_settings;
    if (s.peer_login_expiration_enabled !== undefined) authSettingIds.push("peer_login_expiration");
    if (s.peer_inactivity_expiration_enabled !== undefined) authSettingIds.push("peer_inactivity_expiration");
    if (s.extra?.peer_approval_enabled !== undefined) authSettingIds.push("peer_approval");
    if (s.extra?.user_approval_required !== undefined) authSettingIds.push("user_approval");
    if (s.dns_domain) authSettingIds.push("dns_domain");
    if (s.network_range) authSettingIds.push("network_range");
    if (s.routing_peer_dns_resolution_enabled !== undefined) authSettingIds.push("routing_peer_dns_resolution_enabled");
    if (s.auto_update_version !== undefined) authSettingIds.push("auto_update_version");
    if (s.lazy_connection_enabled !== undefined) authSettingIds.push("lazy_connection_enabled");
  }

  return {
    groups: data.groups
      .filter((g) => g.name.toLowerCase() !== "all")
      .map((g) => g.id),
    posture_checks: data.posture_checks.map((p) => p.id),
    policies: data.policies.map((p) => p.id),
    routes: data.routes.map((r) => r.id),
    dns: data.dns.map((d) => d.id),
    dns_zones: (data.dns_zones || []).map((z) => z.id),
    dns_settings: data.dns_settings?.disabled_management_groups?.length
      ? ["disabled_management_groups"]
      : [],
    networks: data.networks.map((n) => n.id),
    // Reverse Proxy resources are platform-bound (target_cluster pins them to
    // a specific cluster, and CE/Cloud use different cluster infrastructure),
    // so we don't auto-select them when migrating across platforms.
    // Also drop entries without a real ID — those are platform-provided
    // (e.g. type: "free") cluster domains, not user config.
    reverse_proxy_domains: isCrossPlatformMigration(ctx.sourceUrl, ctx.destUrl)
      ? []
      : (data.reverse_proxy_domains || [])
          .filter((d) => d.id && d.id.length > 0)
          .map((d) => d.id),
    reverse_proxy_services: isCrossPlatformMigration(
      ctx.sourceUrl,
      ctx.destUrl
    )
      ? []
      : (data.reverse_proxy_services || [])
          .filter((s) => s.source !== "ephemeral")
          .filter((s) => s.id && s.id.length > 0)
          .map((s) => s.id),
    account_settings: authSettingIds,
  };
}
