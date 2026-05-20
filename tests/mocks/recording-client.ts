import type { NetBirdClient } from "@/lib/netbird-client";
import type {
  Account,
  DNSNameserverGroup,
  DNSRecord,
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
} from "@/lib/types";

export interface RecordedCall {
  method: string;
  args: unknown[];
  sequence: number;
}

interface RecordingOptions {
  // Pre-existing destination resources (used by pre-fetch lookups).
  destGroups?: Group[];
  destPostureChecks?: PostureCheck[];
  destPolicies?: Policy[];
  destNetworks?: Network[];
  destReverseProxyDomains?: ReverseProxyDomain[];
  destReverseProxyServices?: ReverseProxyService[];
  destAccounts?: Account[];

  // Force specific methods to throw — keyed by method name.
  throwOn?: Record<string, Error>;
}

/**
 * Acts as a stand-in for NetBirdClient in unit/integration tests.
 *
 * - Records every call in `calls` (in order) so tests can assert ordering and
 *   payload contents.
 * - Returns realistic destination IDs (different from source IDs) so the
 *   IdMapping logic is meaningfully exercised.
 */
export class RecordingMockClient {
  calls: RecordedCall[] = [];
  private seq = 0;
  private idCounter = 0;
  private opts: RecordingOptions;

  constructor(opts: RecordingOptions = {}) {
    this.opts = opts;
  }

  private newId(prefix: string): string {
    return `${prefix}-${++this.idCounter}`;
  }

  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args, sequence: this.seq++ });
    const err = this.opts.throwOn?.[method];
    if (err) throw err;
  }

  callsOf(method: string): RecordedCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  // ---------- Groups ----------
  async getGroups(): Promise<Group[]> {
    this.record("getGroups", []);
    return this.opts.destGroups ?? [];
  }
  async createGroup(data: { name: string; peers?: string[] }): Promise<Group> {
    this.record("createGroup", [data]);
    return {
      id: this.newId("dest-grp"),
      name: data.name,
      peers_count: 0,
      resources_count: 0,
      issued: "api",
      peers: [],
      resources: [],
    };
  }
  async updateGroup(
    id: string,
    data: { name: string; peers?: string[] }
  ): Promise<Group> {
    this.record("updateGroup", [id, data]);
    return {
      id,
      name: data.name,
      peers_count: 0,
      resources_count: 0,
      issued: "api",
      peers: [],
      resources: [],
    };
  }

  // ---------- Posture Checks ----------
  async getPostureChecks(): Promise<PostureCheck[]> {
    this.record("getPostureChecks", []);
    return this.opts.destPostureChecks ?? [];
  }
  async createPostureCheck(data: {
    name: string;
    description: string;
    checks: Record<string, unknown>;
  }): Promise<PostureCheck> {
    this.record("createPostureCheck", [data]);
    return { id: this.newId("dest-pc"), ...data };
  }
  async updatePostureCheck(
    id: string,
    data: { name: string; description: string; checks: Record<string, unknown> }
  ): Promise<PostureCheck> {
    this.record("updatePostureCheck", [id, data]);
    return { id, ...data };
  }

  // ---------- Policies ----------
  async getPolicies(): Promise<Policy[]> {
    this.record("getPolicies", []);
    return this.opts.destPolicies ?? [];
  }
  async createPolicy(data: unknown): Promise<Policy> {
    this.record("createPolicy", [data]);
    return {
      id: this.newId("dest-pol"),
      name: "",
      description: "",
      enabled: true,
      rules: [],
    };
  }
  async updatePolicy(id: string, data: unknown): Promise<Policy> {
    this.record("updatePolicy", [id, data]);
    return {
      id,
      name: "",
      description: "",
      enabled: true,
      rules: [],
    };
  }

  // ---------- Routes ----------
  async getRoutes(): Promise<Route[]> {
    this.record("getRoutes", []);
    return [];
  }
  async createRoute(data: unknown): Promise<Route> {
    this.record("createRoute", [data]);
    return {
      id: this.newId("dest-rt"),
      name: "",
      description: "",
      network_id: "",
      network: "",
      enabled: true,
      peer: "",
      peer_groups: [],
      metric: 9999,
      masquerade: true,
      groups: [],
      keep_route: false,
    };
  }
  async updateRoute(id: string, data: unknown): Promise<Route> {
    this.record("updateRoute", [id, data]);
    return {
      id,
      name: "",
      description: "",
      network_id: "",
      network: "",
      enabled: true,
      peer: "",
      peer_groups: [],
      metric: 9999,
      masquerade: true,
      groups: [],
      keep_route: false,
    };
  }

  // ---------- DNS ----------
  async getDNSNameserverGroups(): Promise<DNSNameserverGroup[]> {
    this.record("getDNSNameserverGroups", []);
    return [];
  }
  async createDNSNameserverGroup(data: unknown): Promise<DNSNameserverGroup> {
    this.record("createDNSNameserverGroup", [data]);
    return {
      id: this.newId("dest-dns"),
      name: "",
      description: "",
      nameservers: [],
      enabled: true,
      groups: [],
      primary: false,
      domains: [],
      search_domains_enabled: false,
    };
  }
  async updateDNSNameserverGroup(
    id: string,
    data: unknown
  ): Promise<DNSNameserverGroup> {
    this.record("updateDNSNameserverGroup", [id, data]);
    return {
      id,
      name: "",
      description: "",
      nameservers: [],
      enabled: true,
      groups: [],
      primary: false,
      domains: [],
      search_domains_enabled: false,
    };
  }

  async getDNSSettings(): Promise<DNSSettings> {
    this.record("getDNSSettings", []);
    return { disabled_management_groups: [] };
  }
  async updateDNSSettings(data: DNSSettings): Promise<DNSSettings> {
    this.record("updateDNSSettings", [data]);
    return data;
  }

  async getDNSZones(): Promise<DNSZone[]> {
    this.record("getDNSZones", []);
    return [];
  }
  async createDNSZone(data: {
    name: string;
    domain: string;
    enabled: boolean;
    enable_search_domain: boolean;
    distribution_groups: string[];
  }): Promise<DNSZone> {
    this.record("createDNSZone", [data]);
    return { id: this.newId("dest-zone"), ...data, records: [] };
  }
  async updateDNSZone(id: string, data: unknown): Promise<DNSZone> {
    this.record("updateDNSZone", [id, data]);
    return {
      id,
      name: "",
      domain: "",
      enabled: true,
      enable_search_domain: false,
      distribution_groups: [],
      records: [],
    };
  }
  async getDNSZoneRecords(zoneId: string): Promise<DNSRecord[]> {
    this.record("getDNSZoneRecords", [zoneId]);
    return [];
  }
  async createDNSZoneRecord(
    zoneId: string,
    data: unknown
  ): Promise<DNSRecord> {
    this.record("createDNSZoneRecord", [zoneId, data]);
    return { id: this.newId("dest-rec"), name: "", type: "A", content: "", ttl: 60 };
  }

  // ---------- Networks ----------
  async getNetworks(): Promise<Network[]> {
    this.record("getNetworks", []);
    return this.opts.destNetworks ?? [];
  }
  async createNetwork(data: {
    name: string;
    description: string;
  }): Promise<Network> {
    this.record("createNetwork", [data]);
    return {
      id: this.newId("dest-net"),
      name: data.name,
      description: data.description,
      routers: [],
      resources: [],
      routing_peers_count: 0,
      policies: [],
    };
  }
  async getNetworkResources(networkId: string): Promise<NetworkResource[]> {
    this.record("getNetworkResources", [networkId]);
    return [];
  }
  async createNetworkResource(
    networkId: string,
    data: unknown
  ): Promise<NetworkResource> {
    this.record("createNetworkResource", [networkId, data]);
    return {
      id: this.newId("dest-nres"),
      name: "",
      description: "",
      type: "host",
      address: "",
      groups: [],
    };
  }
  async getNetworkRouters(networkId: string): Promise<NetworkRouter[]> {
    this.record("getNetworkRouters", [networkId]);
    return [];
  }
  async createNetworkRouter(
    networkId: string,
    data: unknown
  ): Promise<NetworkRouter> {
    this.record("createNetworkRouter", [networkId, data]);
    return {
      id: this.newId("dest-router"),
      peer: "",
      peer_groups: [],
      metric: 9999,
      masquerade: true,
    };
  }

  // ---------- Reverse Proxy ----------
  async getReverseProxyDomains(): Promise<ReverseProxyDomain[]> {
    this.record("getReverseProxyDomains", []);
    return this.opts.destReverseProxyDomains ?? [];
  }
  async createReverseProxyDomain(data: {
    domain: string;
  }): Promise<ReverseProxyDomain> {
    this.record("createReverseProxyDomain", [data]);
    return { id: this.newId("dest-rpd"), domain: data.domain };
  }
  async getReverseProxyServices(): Promise<ReverseProxyService[]> {
    this.record("getReverseProxyServices", []);
    return this.opts.destReverseProxyServices ?? [];
  }
  async createReverseProxyService(data: unknown): Promise<ReverseProxyService> {
    this.record("createReverseProxyService", [data]);
    return {
      id: this.newId("dest-rps"),
      name: "",
      domain: "",
      protocol: "https",
      targets: [],
      source: "permanent",
    };
  }
  async updateReverseProxyService(
    serviceId: string,
    data: unknown
  ): Promise<ReverseProxyService> {
    this.record("updateReverseProxyService", [serviceId, data]);
    return {
      id: serviceId,
      name: "",
      domain: "",
      protocol: "https",
      targets: [],
      source: "permanent",
    };
  }

  // ---------- Accounts ----------
  async getAccounts(): Promise<Account[]> {
    this.record("getAccounts", []);
    return this.opts.destAccounts ?? [];
  }
  async updateAccount(
    id: string,
    settings: Record<string, unknown>
  ): Promise<Account> {
    this.record("updateAccount", [id, settings]);
    return {
      id,
      settings: settings as Account["settings"],
    };
  }
}

export function asNetBirdClient(
  mock: RecordingMockClient
): NetBirdClient {
  return mock as unknown as NetBirdClient;
}
