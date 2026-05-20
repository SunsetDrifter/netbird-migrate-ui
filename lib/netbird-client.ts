import type {
  Group,
  PostureCheck,
  Policy,
  Route,
  DNSNameserverGroup,
  DNSSettings,
  DNSZone,
  DNSRecord,
  Network,
  NetworkResource,
  NetworkRouter,
  Account,
  AccountSettings,
  ReverseProxyDomain,
  ReverseProxyService,
  ReverseProxyTarget,
  ReverseProxyAuthentication,
  ReverseProxyAccessControl,
  ReverseProxyAdvancedSettings,
  SourceResources,
} from "./types";

export class NetBirdClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string, url: string) {
    this.token = token;
    this.baseUrl = url.replace(/\/+$/, "");
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    retryCount = 0
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Token ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429) {
      if (retryCount >= 5) {
        throw new Error(`Rate limited after ${retryCount} retries: ${method} ${endpoint}`);
      }
      const retryAfter = res.headers.get("Retry-After");
      const delay = retryAfter
        ? parseInt(retryAfter) * 1000
        : Math.min(1000 * 2 ** retryCount, 30000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.request<T>(method, endpoint, body, retryCount + 1);
    }

    if (!res.ok) {
      const text = await res.text();
      let detail = `API error ${res.status}`;
      try {
        const err = JSON.parse(text);
        detail = err.message || detail;
      } catch {
        if (text) detail = text;
      }
      console.error(`NetBird API error: ${res.status} ${method} ${endpoint}: ${detail}`);

      let clientMessage: string;
      switch (res.status) {
        case 401:
        case 403:
          clientMessage = "Authentication failed";
          break;
        case 404:
          clientMessage = "Resource not found";
          break;
        case 429:
          clientMessage = "Rate limited by NetBird API";
          break;
        default:
          clientMessage = res.status >= 500
            ? "NetBird API server error"
            : `Request failed (${res.status})`;
      }
      throw new Error(clientMessage);
    }

    if (res.status === 204) return {} as T;
    return res.json();
  }

  async testConnection(): Promise<boolean> {
    await this.request<Group[]>("GET", "/groups");
    return true;
  }

  // Groups
  async getGroups(): Promise<Group[]> {
    return this.request<Group[]>("GET", "/groups");
  }

  async createGroup(data: {
    name: string;
    peers?: string[];
  }): Promise<Group> {
    return this.request<Group>("POST", "/groups", {
      name: data.name,
      peers: data.peers || [],
    });
  }

  async updateGroup(
    id: string,
    data: { name: string; peers?: string[] }
  ): Promise<Group> {
    return this.request<Group>("PUT", `/groups/${id}`, {
      name: data.name,
      peers: data.peers || [],
    });
  }

  // Posture Checks
  async getPostureChecks(): Promise<PostureCheck[]> {
    return this.request<PostureCheck[]>("GET", "/posture-checks");
  }

  async createPostureCheck(data: {
    name: string;
    description: string;
    checks: Record<string, unknown>;
  }): Promise<PostureCheck> {
    return this.request<PostureCheck>("POST", "/posture-checks", data);
  }

  async updatePostureCheck(
    id: string,
    data: {
      name: string;
      description: string;
      checks: Record<string, unknown>;
    }
  ): Promise<PostureCheck> {
    return this.request<PostureCheck>("PUT", `/posture-checks/${id}`, data);
  }

  // Policies
  async getPolicies(): Promise<Policy[]> {
    return this.request<Policy[]>("GET", "/policies");
  }

  async createPolicy(data: {
    name: string;
    description: string;
    enabled: boolean;
    rules: {
      name: string;
      enabled: boolean;
      action: string;
      protocol: string;
      bidirectional: boolean;
      sources: string[];
      destinations: string[];
      ports: string[];
    }[];
    source_posture_checks?: string[];
  }): Promise<Policy> {
    return this.request<Policy>("POST", "/policies", data);
  }

  async updatePolicy(
    id: string,
    data: {
      name: string;
      description: string;
      enabled: boolean;
      rules: {
        name: string;
        enabled: boolean;
        action: string;
        protocol: string;
        bidirectional: boolean;
        sources: string[];
        destinations: string[];
        ports: string[];
      }[];
      source_posture_checks?: string[];
    }
  ): Promise<Policy> {
    return this.request<Policy>("PUT", `/policies/${id}`, data);
  }

  // Routes
  async getRoutes(): Promise<Route[]> {
    return this.request<Route[]>("GET", "/routes");
  }

  async createRoute(data: {
    name: string;
    description: string;
    network_id: string;
    network: string;
    enabled: boolean;
    peer_groups: string[];
    metric: number;
    masquerade: boolean;
    groups: string[];
    keep_route: boolean;
    domains?: string[];
  }): Promise<Route> {
    return this.request<Route>("POST", "/routes", data);
  }

  async updateRoute(
    id: string,
    data: {
      name: string;
      description: string;
      network_id: string;
      network: string;
      enabled: boolean;
      peer_groups: string[];
      metric: number;
      masquerade: boolean;
      groups: string[];
      keep_route: boolean;
      domains?: string[];
    }
  ): Promise<Route> {
    return this.request<Route>("PUT", `/routes/${id}`, data);
  }

  // DNS Nameserver Groups
  async getDNSNameserverGroups(): Promise<DNSNameserverGroup[]> {
    return this.request<DNSNameserverGroup[]>("GET", "/dns/nameservers");
  }

  async createDNSNameserverGroup(data: {
    name: string;
    description: string;
    nameservers: { ip: string; ns_type: string; port: number }[];
    enabled: boolean;
    groups: string[];
    primary: boolean;
    domains: string[];
    search_domains_enabled: boolean;
  }): Promise<DNSNameserverGroup> {
    return this.request<DNSNameserverGroup>(
      "POST",
      "/dns/nameservers",
      data
    );
  }

  async updateDNSNameserverGroup(
    id: string,
    data: {
      name: string;
      description: string;
      nameservers: { ip: string; ns_type: string; port: number }[];
      enabled: boolean;
      groups: string[];
      primary: boolean;
      domains: string[];
      search_domains_enabled: boolean;
    }
  ): Promise<DNSNameserverGroup> {
    return this.request<DNSNameserverGroup>(
      "PUT",
      `/dns/nameservers/${id}`,
      data
    );
  }

  // DNS Settings
  async getDNSSettings(): Promise<DNSSettings> {
    return this.request<DNSSettings>("GET", "/dns/settings");
  }

  async updateDNSSettings(data: DNSSettings): Promise<DNSSettings> {
    return this.request<DNSSettings>("PUT", "/dns/settings", data);
  }

  // DNS Zones
  async getDNSZones(): Promise<DNSZone[]> {
    return this.request<DNSZone[]>("GET", "/dns/zones");
  }

  async createDNSZone(data: {
    name: string;
    domain: string;
    enabled: boolean;
    enable_search_domain: boolean;
    distribution_groups: string[];
  }): Promise<DNSZone> {
    return this.request<DNSZone>("POST", "/dns/zones", data);
  }

  async updateDNSZone(
    id: string,
    data: {
      name: string;
      domain: string;
      enabled: boolean;
      enable_search_domain: boolean;
      distribution_groups: string[];
    }
  ): Promise<DNSZone> {
    return this.request<DNSZone>("PUT", `/dns/zones/${id}`, data);
  }

  async getDNSZoneRecords(zoneId: string): Promise<DNSRecord[]> {
    return this.request<DNSRecord[]>("GET", `/dns/zones/${zoneId}/records`);
  }

  async createDNSZoneRecord(
    zoneId: string,
    data: { name: string; type: string; content: string; ttl: number }
  ): Promise<DNSRecord> {
    return this.request<DNSRecord>(
      "POST",
      `/dns/zones/${zoneId}/records`,
      data
    );
  }

  // Networks
  async getNetworks(): Promise<Network[]> {
    return this.request<Network[]>("GET", "/networks");
  }

  async createNetwork(data: {
    name: string;
    description: string;
  }): Promise<Network> {
    return this.request<Network>("POST", "/networks", data);
  }

  async getNetworkResources(networkId: string): Promise<NetworkResource[]> {
    return this.request<NetworkResource[]>(
      "GET",
      `/networks/${networkId}/resources`
    );
  }

  async createNetworkResource(
    networkId: string,
    data: {
      name: string;
      description: string;
      type: string;
      address: string;
      groups: string[];
    }
  ): Promise<NetworkResource> {
    return this.request<NetworkResource>(
      "POST",
      `/networks/${networkId}/resources`,
      data
    );
  }

  async getNetworkRouters(networkId: string): Promise<NetworkRouter[]> {
    return this.request<NetworkRouter[]>(
      "GET",
      `/networks/${networkId}/routers`
    );
  }

  async createNetworkRouter(
    networkId: string,
    data: {
      peer_groups: string[];
      metric: number;
      masquerade: boolean;
    }
  ): Promise<NetworkRouter> {
    return this.request<NetworkRouter>(
      "POST",
      `/networks/${networkId}/routers`,
      data
    );
  }

  // Reverse Proxy — Domains
  async getReverseProxyDomains(): Promise<ReverseProxyDomain[]> {
    return this.request<ReverseProxyDomain[]>(
      "GET",
      "/reverse-proxies/domains"
    );
  }

  async createReverseProxyDomain(data: {
    domain: string;
  }): Promise<ReverseProxyDomain> {
    return this.request<ReverseProxyDomain>(
      "POST",
      "/reverse-proxies/domains",
      data
    );
  }

  // Reverse Proxy — Services
  async getReverseProxyServices(): Promise<ReverseProxyService[]> {
    return this.request<ReverseProxyService[]>(
      "GET",
      "/reverse-proxies/services"
    );
  }

  async createReverseProxyService(data: {
    name: string;
    description?: string;
    domain: string;
    protocol: string;
    targets: ReverseProxyTarget[];
    authentication?: ReverseProxyAuthentication;
    accessControl?: ReverseProxyAccessControl;
    advancedSettings?: ReverseProxyAdvancedSettings;
  }): Promise<ReverseProxyService> {
    return this.request<ReverseProxyService>(
      "POST",
      "/reverse-proxies/services",
      data
    );
  }

  async updateReverseProxyService(
    serviceId: string,
    data: {
      name: string;
      description?: string;
      domain: string;
      protocol: string;
      targets: ReverseProxyTarget[];
      authentication?: ReverseProxyAuthentication;
      accessControl?: ReverseProxyAccessControl;
      advancedSettings?: ReverseProxyAdvancedSettings;
    }
  ): Promise<ReverseProxyService> {
    return this.request<ReverseProxyService>(
      "PUT",
      `/reverse-proxies/services/${serviceId}`,
      data
    );
  }

  // Accounts
  async getAccounts(): Promise<Account[]> {
    return this.request<Account[]>("GET", "/accounts");
  }

  async updateAccount(id: string, settings: Record<string, unknown>): Promise<Account> {
    return this.request<Account>("PUT", `/accounts/${id}`, { settings });
  }

  // Fetch all resources for migration
  async getAllResources(): Promise<SourceResources> {
    const [
      groups,
      posture_checks,
      policies,
      routes,
      dns,
      dns_zones,
      networksBasic,
      reverse_proxy_domains,
      reverse_proxy_services,
      dns_settings,
      accounts,
    ] = await Promise.all([
      this.getGroups(),
      this.getPostureChecks().catch(() => [] as PostureCheck[]),
      this.getPolicies(),
      this.getRoutes(),
      this.getDNSNameserverGroups(),
      this.getDNSZones().catch(() => [] as DNSZone[]),
      this.getNetworks(),
      this.getReverseProxyDomains().catch(
        () => [] as ReverseProxyDomain[]
      ),
      this.getReverseProxyServices().catch(
        () => [] as ReverseProxyService[]
      ),
      this.getDNSSettings().catch(() => undefined),
      this.getAccounts().catch(() => undefined),
    ]);

    // Enrich networks with full resource and router objects
    // The list endpoint only returns IDs, but we need full objects for export/import
    const networks = await Promise.all(
      networksBasic.map(async (network) => {
        try {
          const [resources, routers] = await Promise.all([
            this.getNetworkResources(network.id),
            this.getNetworkRouters(network.id),
          ]);
          return { ...network, resources, routers };
        } catch {
          // If sub-resource fetch fails, keep original data
          return network;
        }
      })
    );

    // Extract auth-relevant settings from the first account
    let account_settings: AccountSettings | undefined;
    if (accounts && accounts.length > 0) {
      const s = accounts[0].settings;
      account_settings = {
        peer_login_expiration_enabled: s.peer_login_expiration_enabled,
        peer_login_expiration: s.peer_login_expiration as number | undefined,
        peer_inactivity_expiration_enabled: s.peer_inactivity_expiration_enabled,
        peer_inactivity_expiration: s.peer_inactivity_expiration as number | undefined,
        extra: s.extra as AccountSettings["extra"],
        dns_domain: s.dns_domain as string | undefined,
        network_range: s.network_range as string | undefined,
        network_range_v6: s.network_range_v6 as string | undefined,
        ipv6_enabled_groups: s.ipv6_enabled_groups as string[] | undefined,
        routing_peer_dns_resolution_enabled: s.routing_peer_dns_resolution_enabled as boolean | undefined,
        auto_update_version: s.auto_update_version as string | undefined,
        lazy_connection_enabled: s.lazy_connection_enabled as boolean | undefined,
      };
    }

    return {
      groups,
      posture_checks,
      policies,
      routes,
      dns,
      dns_zones,
      networks,
      reverse_proxy_domains,
      reverse_proxy_services,
      dns_settings,
      account_settings,
    };
  }
}
