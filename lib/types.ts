// NetBird API resource types

export interface ConnectionConfig {
  token: string;
  url: string;
}

export interface GroupRef {
  id: string;
  name: string;
}

export interface Peer {
  id: string;
  name: string;
  ip: string;
  connected: boolean;
  last_seen: string;
  os: string;
  version: string;
  groups: GroupRef[];
  hostname: string;
}

export interface Group {
  id: string;
  name: string;
  peers_count: number;
  resources_count: number;
  issued: string;
  // NetBird API returns null (not []) when empty.
  peers?: { id: string; name: string }[] | null;
  resources?: { id: string; type: string }[] | null;
}

export interface PostureCheck {
  id: string;
  name: string;
  description: string;
  checks: Record<string, unknown>;
}

export interface PolicyRuleResourceRef {
  id: string;
  type: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  enabled: boolean;
  action: string;
  protocol: string;
  bidirectional: boolean;
  // NetBird API returns null (not []) for empty sources/destinations.
  sources?: GroupRef[] | null;
  destinations?: GroupRef[] | null;
  ports?: string[] | null;
  source_posture_checks?: string[] | null;
  destinationResource?: PolicyRuleResourceRef | null;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rules: PolicyRule[];
  source_posture_checks?: string[] | null;
}

export interface Route {
  id: string;
  name: string;
  description: string;
  network_id: string;
  network: string;
  enabled: boolean;
  peer: string;
  peer_groups: string[];
  metric: number;
  masquerade: boolean;
  groups: string[];
  keep_route: boolean;
  domains?: string[];
  access_control_groups?: string[];
}

export interface Nameserver {
  ip: string;
  ns_type: string;
  port: number;
}

export interface DNSSettings {
  disabled_management_groups: string[];
}

export interface DNSNameserverGroup {
  id: string;
  name: string;
  description: string;
  nameservers: Nameserver[];
  enabled: boolean;
  groups: string[];
  primary: boolean;
  domains: string[];
  search_domains_enabled: boolean;
}

export interface DNSRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
}

export interface DNSZone {
  id: string;
  name: string;
  domain: string;
  enabled: boolean;
  enable_search_domain: boolean;
  distribution_groups: string[];
  records: DNSRecord[];
}

export interface NetworkResource {
  id: string;
  name: string;
  description: string;
  type: string;
  address: string;
  // NetBird API returns null (not []) when empty.
  groups?: GroupRef[] | null;
}

export interface NetworkRouter {
  id: string;
  peer: string;
  peer_groups: string[];
  metric: number;
  masquerade: boolean;
}

export interface Network {
  id: string;
  name: string;
  description: string;
  routers: NetworkRouter[];
  resources: NetworkResource[];
  routing_peers_count: number;
  policies: string[];
}

// Reverse Proxy types

export type ReverseProxyTargetType = "peer" | "host" | "domain" | "subnet";

export interface ReverseProxyTarget {
  targetIP?: string;
  targetHost?: string;
  targetPort: number;
  type: ReverseProxyTargetType;
}

export interface ReverseProxyAuthentication {
  password?: string;
  pin?: string;
  userGroups?: string[];
  headerAuth?: Record<string, unknown>;
}

export interface ReverseProxyAccessControl {
  allowedIPCIDRs?: string[];
  blockedIPCIDRs?: string[];
  countries?: string[];
  integrations?: Record<string, unknown>;
}

export interface ReverseProxyAdvancedSettings {
  redirectHttpToHttps?: boolean;
  hostHeader?: string;
  proxyProtocol?: boolean;
  sessionTimeout?: number;
}

export interface ReverseProxyDomain {
  id: string;
  domain: string;
  status?: string;
  validated?: boolean;
}

export type ReverseProxyServiceSource = "permanent" | "ephemeral";

export interface ReverseProxyService {
  id: string;
  serviceId?: string;
  name: string;
  description?: string;
  domain: string;
  protocol: string;
  targets: ReverseProxyTarget[];
  authentication?: ReverseProxyAuthentication;
  accessControl?: ReverseProxyAccessControl;
  source: ReverseProxyServiceSource;
  sourcePeer?: string;
  sourcePort?: number;
  ttl?: string;
  advancedSettings?: ReverseProxyAdvancedSettings;
  createdAt?: string;
  updatedAt?: string;
}

// Account settings types

export interface AccountSettingsExtra {
  peer_approval_enabled?: boolean;
  user_approval_required?: boolean;
  network_traffic_logs_enabled?: boolean;
  network_traffic_logs_groups?: string[];
  network_traffic_packet_counter_enabled?: boolean;
}

export interface AccountSettings {
  peer_login_expiration_enabled?: boolean;
  peer_login_expiration?: number;
  peer_inactivity_expiration_enabled?: boolean;
  peer_inactivity_expiration?: number;
  extra?: AccountSettingsExtra;
  dns_domain?: string;
  network_range?: string;
  network_range_v6?: string;
  ipv6_enabled_groups?: string[];
  routing_peer_dns_resolution_enabled?: boolean;
  auto_update_version?: string;
  auto_update_always?: boolean;
  lazy_connection_enabled?: boolean;
  groups_propagation_enabled?: boolean;
  jwt_groups_enabled?: boolean;
  jwt_groups_claim_name?: string;
  jwt_allow_groups?: string[];
  peer_expose_enabled?: boolean;
  peer_expose_groups?: string[];
  regular_users_view_blocked?: boolean;
  local_mfa_enabled?: boolean;
}

export interface Account {
  id: string;
  settings: AccountSettings & Record<string, unknown>;
}

// Migration types

export type ResourceType =
  | "groups"
  | "posture_checks"
  | "policies"
  | "routes"
  | "dns"
  | "dns_zones"
  | "networks"
  | "reverse_proxy_domains"
  | "reverse_proxy_services";

export interface SourceResources {
  groups: Group[];
  posture_checks: PostureCheck[];
  policies: Policy[];
  routes: Route[];
  dns: DNSNameserverGroup[];
  dns_zones: DNSZone[];
  networks: Network[];
  reverse_proxy_domains: ReverseProxyDomain[];
  reverse_proxy_services: ReverseProxyService[];
  dns_settings?: DNSSettings;
  account_settings?: AccountSettings;
}

export interface ResourceSelection {
  groups: string[];
  posture_checks: string[];
  policies: string[];
  routes: string[];
  dns: string[];
  dns_zones: string[];
  dns_settings: string[];
  networks: string[];
  reverse_proxy_domains: string[];
  reverse_proxy_services: string[];
  account_settings: string[];
}

export type ConflictResolution = "skip" | "overwrite";

export interface Conflict {
  resourceType: ResourceType;
  sourceId: string;
  sourceName: string;
  destinationId: string;
  resolution: ConflictResolution;
}

export interface MigrationEvent {
  type: "progress" | "success" | "error" | "complete";
  resourceType?: ResourceType;
  resourceName?: string;
  message: string;
  created?: number;
  skipped?: number;
  failed?: number;
}

export interface MigrationResult {
  created: number;
  skipped: number;
  failed: number;
  errors: { resourceType: ResourceType; name: string; error: string }[];
}
