import { describe, expect, it } from "vitest";
import { buildAutoSelection } from "./build-auto-selection";
import {
  makeFullSourceResources,
  makeGroup,
  makeReverseProxyService,
} from "@/tests/fixtures/netbird";

describe("buildAutoSelection", () => {
  it("selects every resource id by default", () => {
    const data = makeFullSourceResources();
    const sel = buildAutoSelection(data);

    expect(sel.groups).toEqual(data.groups.map((g) => g.id));
    expect(sel.posture_checks).toEqual(data.posture_checks.map((p) => p.id));
    expect(sel.policies).toEqual(data.policies.map((p) => p.id));
    expect(sel.routes).toEqual(data.routes.map((r) => r.id));
    expect(sel.dns).toEqual(data.dns.map((d) => d.id));
    expect(sel.dns_zones).toEqual(data.dns_zones.map((z) => z.id));
    expect(sel.networks).toEqual(data.networks.map((n) => n.id));
  });

  it("excludes the 'All' built-in group from default selection", () => {
    const data = makeFullSourceResources({
      groups: [
        makeGroup({ id: "all", name: "All" }),
        makeGroup({ id: "src-grp-1", name: "Developers" }),
      ],
    });
    const sel = buildAutoSelection(data);
    expect(sel.groups).toEqual(["src-grp-1"]);
  });

  it("auto-selects reverse proxy domains and permanent services only", () => {
    const data = makeFullSourceResources({
      reverse_proxy_services: [
        makeReverseProxyService({ id: "perm", source: "permanent" }),
        makeReverseProxyService({ id: "ephem", source: "ephemeral" }),
      ],
    });
    const sel = buildAutoSelection(data);
    expect(sel.reverse_proxy_domains).toEqual(
      data.reverse_proxy_domains.map((d) => d.id)
    );
    expect(sel.reverse_proxy_services).toEqual(["perm"]);
  });

  it("filters out reverse proxy domains with empty IDs (platform-provided clusters)", () => {
    const data = makeFullSourceResources({
      reverse_proxy_domains: [
        { id: "", domain: "proxy.cluster.example", validated: true },
        { id: "real-id", domain: "api.example.com", validated: true },
      ],
    });
    const sel = buildAutoSelection(data);
    expect(sel.reverse_proxy_domains).toEqual(["real-id"]);
  });

  it("auto-deselects all reverse proxy resources for cross-platform migrations", () => {
    const data = makeFullSourceResources({
      reverse_proxy_services: [
        makeReverseProxyService({ id: "perm", source: "permanent" }),
      ],
    });
    const sel = buildAutoSelection(data, {
      sourceUrl: "https://community.meshmap.ai/api",
      destUrl: "https://api.netbird.io/api",
    });
    expect(sel.reverse_proxy_domains).toEqual([]);
    expect(sel.reverse_proxy_services).toEqual([]);
  });

  it("keeps reverse proxy auto-selection for same-platform migrations", () => {
    const data = makeFullSourceResources();
    const sel = buildAutoSelection(data, {
      sourceUrl: "https://nb1.acme.corp/api",
      destUrl: "https://nb2.acme.corp/api",
    });
    expect(sel.reverse_proxy_domains).toEqual(
      data.reverse_proxy_domains.map((d) => d.id)
    );
  });

  it("activates dns_settings selection only when disabled groups exist", () => {
    const withSettings = makeFullSourceResources();
    expect(buildAutoSelection(withSettings).dns_settings).toEqual([
      "disabled_management_groups",
    ]);

    const empty = makeFullSourceResources({
      dns_settings: { disabled_management_groups: [] },
    });
    expect(buildAutoSelection(empty).dns_settings).toEqual([]);
  });

  it("activates account_settings entries based on populated fields", () => {
    const data = makeFullSourceResources();
    const sel = buildAutoSelection(data);
    expect(sel.account_settings).toEqual(
      expect.arrayContaining([
        "peer_login_expiration",
        "peer_inactivity_expiration",
        "peer_approval",
        "user_approval",
        "dns_domain",
        "network_range",
        "network_range_v6",
        "ipv6_enabled_groups",
        "routing_peer_dns_resolution_enabled",
        "auto_update_version",
        "auto_update_always",
        "lazy_connection_enabled",
        "groups_propagation_enabled",
        "jwt_groups_enabled",
        "jwt_groups_claim_name",
        "jwt_allow_groups",
        "peer_expose_enabled",
        "peer_expose_groups",
        "regular_users_view_blocked",
        "local_mfa_enabled",
        "network_traffic_logs",
        "network_traffic_packet_counter",
      ])
    );
  });

  it("omits account_settings when the source has none", () => {
    const data = makeFullSourceResources({ account_settings: undefined });
    const sel = buildAutoSelection(data);
    expect(sel.account_settings).toEqual([]);
  });
});
