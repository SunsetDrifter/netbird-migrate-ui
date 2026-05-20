import type {
  Account,
  AccountSettings,
  DNSNameserverGroup,
  DNSSettings,
  DNSZone,
  Group,
  Network,
  NetworkResource,
  NetworkRouter,
  Policy,
  PostureCheck,
  ReverseProxyDomain,
  ReverseProxyService,
  Route,
  SourceResources,
} from "@/lib/types";

export const makeGroup = (overrides: Partial<Group> = {}): Group => ({
  id: "src-grp-1",
  name: "Developers",
  peers_count: 0,
  resources_count: 0,
  issued: "api",
  peers: [],
  resources: [],
  ...overrides,
});

export const makePostureCheck = (
  overrides: Partial<PostureCheck> = {}
): PostureCheck => ({
  id: "src-pc-1",
  name: "OS Version Check",
  description: "Require macOS 14+",
  checks: { os: { macOS: { min: "14" } } },
  ...overrides,
});

export const makePolicy = (overrides: Partial<Policy> = {}): Policy => ({
  id: "src-pol-1",
  name: "Allow Devs",
  description: "Developers to prod",
  enabled: true,
  rules: [
    {
      id: "src-rule-1",
      name: "rule-1",
      enabled: true,
      action: "accept",
      protocol: "tcp",
      bidirectional: true,
      sources: [{ id: "src-grp-1", name: "Developers" }],
      destinations: [{ id: "src-grp-2", name: "Prod" }],
      ports: ["443"],
    },
  ],
  source_posture_checks: [],
  ...overrides,
});

export const makeRoute = (overrides: Partial<Route> = {}): Route => ({
  id: "src-rt-1",
  name: "office-net",
  description: "office subnet",
  network_id: "office",
  network: "10.0.0.0/24",
  enabled: true,
  peer: "",
  peer_groups: ["src-grp-1"],
  metric: 9999,
  masquerade: true,
  groups: ["src-grp-2"],
  keep_route: false,
  ...overrides,
});

export const makeDNS = (
  overrides: Partial<DNSNameserverGroup> = {}
): DNSNameserverGroup => ({
  id: "src-dns-1",
  name: "Custom DNS",
  description: "Cloudflare",
  nameservers: [{ ip: "1.1.1.1", ns_type: "udp", port: 53 }],
  enabled: true,
  groups: ["src-grp-1"],
  primary: false,
  domains: ["internal.example.com"],
  search_domains_enabled: false,
  ...overrides,
});

export const makeDNSZone = (overrides: Partial<DNSZone> = {}): DNSZone => ({
  id: "src-zone-1",
  name: "Internal",
  domain: "int.example.com",
  enabled: true,
  enable_search_domain: false,
  distribution_groups: ["src-grp-1"],
  records: [
    {
      id: "rec-1",
      name: "app",
      type: "A",
      content: "10.0.0.10",
      ttl: 300,
    },
  ],
  ...overrides,
});

export const makeNetwork = (overrides: Partial<Network> = {}): Network => ({
  id: "src-net-1",
  name: "main",
  description: "main network",
  routers: [
    {
      id: "src-router-1",
      peer: "",
      peer_groups: ["src-grp-1"],
      metric: 9999,
      masquerade: true,
    } satisfies NetworkRouter,
  ],
  resources: [
    {
      id: "src-nres-1",
      name: "api-server",
      description: "api",
      type: "host",
      address: "10.0.0.20",
      groups: [{ id: "src-grp-1", name: "Developers" }],
    } satisfies NetworkResource,
  ],
  routing_peers_count: 0,
  policies: [],
  ...overrides,
});

export const makeReverseProxyDomain = (
  overrides: Partial<ReverseProxyDomain> = {}
): ReverseProxyDomain => ({
  id: "src-rpd-1",
  domain: "api.example.com",
  status: "active",
  validated: true,
  ...overrides,
});

export const makeReverseProxyService = (
  overrides: Partial<ReverseProxyService> = {}
): ReverseProxyService => ({
  id: "src-rps-1",
  name: "api-service",
  description: "API ingress",
  domain: "api.example.com",
  protocol: "https",
  targets: [
    { targetIP: "10.0.0.20", targetPort: 443, type: "peer" },
  ],
  source: "permanent",
  authentication: {
    userGroups: ["src-grp-1"],
  },
  ...overrides,
});

export const makeAccountSettings = (
  overrides: Partial<AccountSettings> = {}
): AccountSettings => ({
  peer_login_expiration_enabled: true,
  peer_login_expiration: 86400 * 7,
  peer_inactivity_expiration_enabled: false,
  peer_inactivity_expiration: 600,
  dns_domain: "netbird.cloud",
  network_range: "100.64.0.0/10",
  routing_peer_dns_resolution_enabled: true,
  auto_update_version: "latest",
  lazy_connection_enabled: false,
  extra: {
    peer_approval_enabled: false,
    user_approval_required: false,
  },
  ...overrides,
});

export const makeAccount = (overrides: Partial<Account> = {}): Account => ({
  id: "dest-acct-1",
  settings: makeAccountSettings() as AccountSettings & Record<string, unknown>,
  ...overrides,
});

export const makeDNSSettings = (
  overrides: Partial<DNSSettings> = {}
): DNSSettings => ({
  disabled_management_groups: ["src-grp-1"],
  ...overrides,
});

export const makeFullSourceResources = (
  overrides: Partial<SourceResources> = {}
): SourceResources => ({
  groups: [
    makeGroup({ id: "src-grp-1", name: "Developers" }),
    makeGroup({ id: "src-grp-2", name: "Prod" }),
  ],
  posture_checks: [makePostureCheck()],
  policies: [makePolicy()],
  routes: [makeRoute()],
  dns: [makeDNS()],
  dns_zones: [makeDNSZone()],
  networks: [makeNetwork()],
  reverse_proxy_domains: [makeReverseProxyDomain()],
  reverse_proxy_services: [makeReverseProxyService()],
  dns_settings: makeDNSSettings(),
  account_settings: makeAccountSettings(),
  ...overrides,
});
