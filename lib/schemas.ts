import { z } from "zod";

// Bounded primitives — keep noisy fields realistic
const TokenSchema = z.string().min(1).max(500);
const UrlSchema = z.string().url().max(2048);
const IdSchema = z.string().min(1).max(256);
const NameSchema = z.string().min(1).max(512);

const PeerRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const ResourceRefSchema = z.object({
  id: z.string(),
  type: z.string(),
});

const GroupRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  peers_count: z.number(),
  resources_count: z.number(),
  issued: z.string(),
  // NetBird returns null when empty.
  peers: z.array(PeerRefSchema).nullish(),
  resources: z.array(ResourceRefSchema).nullish(),
});

const PostureCheckSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  checks: z.record(z.string(), z.unknown()),
});

const PolicyRuleResourceRefSchema = z.object({
  id: z.string(),
  type: z.string(),
});

const PolicyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  action: z.string(),
  protocol: z.string(),
  bidirectional: z.boolean(),
  // NetBird returns null when empty / when destinationResource is used.
  sources: z.array(GroupRefSchema).nullish(),
  destinations: z.array(GroupRefSchema).nullish(),
  ports: z.array(z.string()).nullish(),
  source_posture_checks: z.array(z.string()).nullish(),
  // Newer NetBird feature: a single network resource as the destination.
  destinationResource: PolicyRuleResourceRefSchema.nullish(),
});

const PolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  rules: z.array(PolicyRuleSchema),
  source_posture_checks: z.array(z.string()).nullish(),
});

const RouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  network_id: z.string(),
  network: z.string(),
  enabled: z.boolean(),
  peer: z.string(),
  peer_groups: z.array(z.string()),
  metric: z.number(),
  masquerade: z.boolean(),
  groups: z.array(z.string()),
  keep_route: z.boolean(),
  domains: z.array(z.string()).optional(),
  access_control_groups: z.array(z.string()).optional(),
});

const NameserverSchema = z.object({
  ip: z.string(),
  ns_type: z.string(),
  port: z.number(),
});

const DNSNameserverGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  nameservers: z.array(NameserverSchema),
  enabled: z.boolean(),
  groups: z.array(z.string()),
  primary: z.boolean(),
  domains: z.array(z.string()),
  search_domains_enabled: z.boolean(),
});

const DNSRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  content: z.string(),
  ttl: z.number(),
});

const DNSZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  enabled: z.boolean(),
  enable_search_domain: z.boolean(),
  distribution_groups: z.array(z.string()),
  records: z.array(DNSRecordSchema),
});

const DNSSettingsSchema = z.object({
  disabled_management_groups: z.array(z.string()),
});

const NetworkResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.string(),
  address: z.string(),
  // NetBird returns null when empty.
  groups: z.array(GroupRefSchema).nullish(),
});

const NetworkRouterSchema = z.object({
  id: z.string(),
  peer: z.string(),
  peer_groups: z.array(z.string()),
  metric: z.number(),
  masquerade: z.boolean(),
});

const NetworkSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  routers: z.array(NetworkRouterSchema),
  resources: z.array(NetworkResourceSchema),
  routing_peers_count: z.number(),
  policies: z.array(z.string()),
});

const ReverseProxyDomainSchema = z.object({
  id: z.string(),
  domain: z.string(),
  status: z.string().optional(),
  validated: z.boolean().optional(),
});

const ReverseProxyTargetSchema = z.object({
  targetIP: z.string().optional(),
  targetHost: z.string().optional(),
  targetPort: z.number(),
  type: z.enum(["peer", "host", "domain", "subnet"]),
});

const ReverseProxyServiceSchema = z.object({
  id: z.string(),
  serviceId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  domain: z.string(),
  protocol: z.string(),
  targets: z.array(ReverseProxyTargetSchema),
  authentication: z
    .object({
      password: z.string().optional(),
      pin: z.string().optional(),
      userGroups: z.array(z.string()).optional(),
      headerAuth: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  accessControl: z
    .object({
      allowedIPCIDRs: z.array(z.string()).optional(),
      blockedIPCIDRs: z.array(z.string()).optional(),
      countries: z.array(z.string()).optional(),
      integrations: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  source: z.enum(["permanent", "ephemeral"]),
  sourcePeer: z.string().optional(),
  sourcePort: z.number().optional(),
  ttl: z.string().optional(),
  advancedSettings: z
    .object({
      redirectHttpToHttps: z.boolean().optional(),
      hostHeader: z.string().optional(),
      proxyProtocol: z.boolean().optional(),
      sessionTimeout: z.number().optional(),
    })
    .optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const AccountSettingsSchema = z.object({
  peer_login_expiration_enabled: z.boolean().optional(),
  peer_login_expiration: z.number().optional(),
  peer_inactivity_expiration_enabled: z.boolean().optional(),
  peer_inactivity_expiration: z.number().optional(),
  extra: z
    .object({
      peer_approval_enabled: z.boolean().optional(),
      user_approval_required: z.boolean().optional(),
    })
    .optional(),
  dns_domain: z.string().optional(),
  network_range: z.string().optional(),
  routing_peer_dns_resolution_enabled: z.boolean().optional(),
  auto_update_version: z.string().optional(),
  lazy_connection_enabled: z.boolean().optional(),
});

export const SourceResourcesSchema = z.object({
  groups: z.array(GroupSchema),
  posture_checks: z.array(PostureCheckSchema),
  policies: z.array(PolicySchema),
  routes: z.array(RouteSchema),
  dns: z.array(DNSNameserverGroupSchema),
  dns_zones: z.array(DNSZoneSchema),
  networks: z.array(NetworkSchema),
  reverse_proxy_domains: z.array(ReverseProxyDomainSchema),
  reverse_proxy_services: z.array(ReverseProxyServiceSchema),
  dns_settings: DNSSettingsSchema.optional(),
  account_settings: AccountSettingsSchema.optional(),
});

export const ResourceSelectionSchema = z.object({
  groups: z.array(z.string()),
  posture_checks: z.array(z.string()),
  policies: z.array(z.string()),
  routes: z.array(z.string()),
  dns: z.array(z.string()),
  dns_zones: z.array(z.string()),
  dns_settings: z.array(z.string()),
  networks: z.array(z.string()),
  reverse_proxy_domains: z.array(z.string()),
  reverse_proxy_services: z.array(z.string()),
  account_settings: z.array(z.string()),
});

const ResourceTypeSchema = z.enum([
  "groups",
  "posture_checks",
  "policies",
  "routes",
  "dns",
  "dns_zones",
  "networks",
  "reverse_proxy_domains",
  "reverse_proxy_services",
]);

const ConflictSchema = z.object({
  resourceType: ResourceTypeSchema,
  sourceId: IdSchema,
  sourceName: NameSchema,
  destinationId: IdSchema,
  resolution: z.enum(["skip", "overwrite"]),
});

export const ConnectRequestSchema = z.object({
  token: TokenSchema,
  url: UrlSchema,
});

export const ResourcesRequestSchema = z.object({
  token: TokenSchema,
  url: UrlSchema,
});

export const MigrateRequestSchema = z
  .object({
    sourceToken: z.string().max(500).optional().or(z.literal("")),
    sourceUrl: UrlSchema.optional().or(z.literal("")),
    destToken: TokenSchema,
    destUrl: UrlSchema,
    resources: SourceResourcesSchema,
    selection: ResourceSelectionSchema,
    conflicts: z.array(ConflictSchema),
  })
  .refine(
    (data) => {
      const hasSourceCreds = !!(data.sourceToken && data.sourceUrl);
      if (hasSourceCreds) return true;
      return Array.isArray(data.resources?.groups);
    },
    { message: "Source credentials or pre-fetched resources required" }
  );

export type ConnectRequest = z.infer<typeof ConnectRequestSchema>;
export type ResourcesRequest = z.infer<typeof ResourcesRequestSchema>;
export type MigrateRequest = z.infer<typeof MigrateRequestSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
