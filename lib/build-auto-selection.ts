import type { ResourceSelection, SourceResources } from "@/lib/types";

export function buildAutoSelection(data: SourceResources): ResourceSelection {
  const authSettingIds: string[] = [];
  if (data.account_settings) {
    const s = data.account_settings;
    if (s.peer_login_expiration_enabled !== undefined) authSettingIds.push("peer_login_expiration");
    if (s.peer_inactivity_expiration_enabled !== undefined) authSettingIds.push("peer_inactivity_expiration");
    if (s.extra?.peer_approval_enabled !== undefined) authSettingIds.push("peer_approval");
    if (s.extra?.user_approval_required !== undefined) authSettingIds.push("user_approval");
    if (s.dns_domain) authSettingIds.push("dns_domain");
    if (s.network_range) authSettingIds.push("network_range");
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
    setup_keys: data.setup_keys
      .filter((k) => k.valid && !k.revoked)
      .map((k) => k.id),
    account_settings: authSettingIds,
  };
}
