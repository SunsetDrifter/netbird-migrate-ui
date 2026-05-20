import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { setupServer } from "msw/node";
import { NetBirdClient } from "./netbird-client";

const BASE = "https://api.test.netbird";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("NetBirdClient — auth header", () => {
  it("sends Authorization: Token <token> on every request", async () => {
    let seenAuth: string | null = null;
    server.use(
      http.get(`${BASE}/groups`, ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return HttpResponse.json([]);
      })
    );

    const client = new NetBirdClient("supersecret", BASE);
    await client.getGroups();

    expect(seenAuth).toBe("Token supersecret");
  });
});

describe("NetBirdClient — error mapping", () => {
  it("maps 401 to a generic 'Authentication failed' message", async () => {
    server.use(
      http.get(`${BASE}/groups`, () =>
        HttpResponse.json({ message: "bad creds" }, { status: 401 })
      )
    );

    const client = new NetBirdClient("tok", BASE);
    await expect(client.getGroups()).rejects.toThrow(/Authentication failed/);
  });

  it("maps 404 to 'Resource not found'", async () => {
    server.use(
      http.get(`${BASE}/groups`, () =>
        HttpResponse.json({ message: "missing" }, { status: 404 })
      )
    );

    const client = new NetBirdClient("tok", BASE);
    await expect(client.getGroups()).rejects.toThrow(/Resource not found/);
  });

  it("maps 5xx to 'NetBird API server error'", async () => {
    server.use(
      http.get(`${BASE}/groups`, () =>
        HttpResponse.json({ message: "boom" }, { status: 503 })
      )
    );

    const client = new NetBirdClient("tok", BASE);
    await expect(client.getGroups()).rejects.toThrow(/server error/i);
  });
});

describe("NetBirdClient — 429 retry", () => {
  it("retries on 429 with Retry-After honoring the header value", async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE}/groups`, async () => {
        attempts++;
        if (attempts < 3) {
          return new HttpResponse(null, {
            status: 429,
            headers: { "Retry-After": "0" },
          });
        }
        return HttpResponse.json([]);
      })
    );

    const client = new NetBirdClient("tok", BASE);
    await client.getGroups();
    expect(attempts).toBe(3);
  });

  it("surfaces a rate-limit error after the retry cap", async () => {
    server.use(
      http.get(`${BASE}/groups`, () =>
        new HttpResponse(null, {
          status: 429,
          headers: { "Retry-After": "0" },
        })
      )
    );

    const client = new NetBirdClient("tok", BASE);
    await expect(client.getGroups()).rejects.toThrow(/Rate limited/i);
  }, 15000);
});

describe("NetBirdClient — Reverse Proxy endpoints", () => {
  it("getReverseProxyDomains hits /reverse-proxies/domains", async () => {
    let hit = false;
    server.use(
      http.get(`${BASE}/reverse-proxies/domains`, () => {
        hit = true;
        return HttpResponse.json([
          { id: "d1", domain: "api.example.com" },
        ]);
      })
    );

    const client = new NetBirdClient("tok", BASE);
    const domains = await client.getReverseProxyDomains();
    expect(hit).toBe(true);
    expect(domains).toEqual([{ id: "d1", domain: "api.example.com" }]);
  });

  it("createReverseProxyDomain POSTs the domain payload", async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post(`${BASE}/reverse-proxies/domains`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          id: "d-new",
          domain: "api.example.com",
        });
      })
    );

    const client = new NetBirdClient("tok", BASE);
    const result = await client.createReverseProxyDomain({
      domain: "api.example.com",
    });

    expect(receivedBody).toEqual({ domain: "api.example.com" });
    expect(result.id).toBe("d-new");
  });

  it("createReverseProxyService POSTs the service payload", async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/reverse-proxies/services`, async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: "s-new",
          name: (receivedBody as { name: string }).name,
          domain: (receivedBody as { domain: string }).domain,
          protocol: "https",
          targets: [],
          source: "permanent",
        });
      })
    );

    const client = new NetBirdClient("tok", BASE);
    const result = await client.createReverseProxyService({
      name: "api",
      domain: "api.example.com",
      protocol: "https",
      targets: [{ targetIP: "10.0.0.20", targetPort: 443, type: "peer" }],
    });

    const body = receivedBody as unknown as {
      name: string;
      targets: unknown[];
    };
    expect(body).not.toBeNull();
    expect(body.name).toBe("api");
    expect(body.targets).toHaveLength(1);
    expect(result.id).toBe("s-new");
  });

  it("updateReverseProxyService PUTs to /reverse-proxies/services/{id}", async () => {
    let seenUrl = "";
    server.use(
      http.put(
        `${BASE}/reverse-proxies/services/:id`,
        ({ request, params }) => {
          seenUrl = request.url;
          return HttpResponse.json({
            id: params.id,
            name: "api",
            domain: "api.example.com",
            protocol: "https",
            targets: [],
            source: "permanent",
          });
        }
      )
    );

    const client = new NetBirdClient("tok", BASE);
    await client.updateReverseProxyService("s-1", {
      name: "api",
      domain: "api.example.com",
      protocol: "https",
      targets: [],
    });
    expect(seenUrl).toContain("/reverse-proxies/services/s-1");
  });
});

describe("NetBirdClient — base URL handling", () => {
  it("strips trailing slashes from the base URL", async () => {
    let hit = false;
    server.use(
      http.get(`${BASE}/groups`, () => {
        hit = true;
        return HttpResponse.json([]);
      })
    );

    const client = new NetBirdClient("tok", `${BASE}////`);
    await client.getGroups();
    expect(hit).toBe(true);
  });
});

describe("NetBirdClient — testConnection", () => {
  it("returns true on a successful GET /groups", async () => {
    server.use(
      http.get(`${BASE}/groups`, () => HttpResponse.json([]))
    );
    const client = new NetBirdClient("tok", BASE);
    await expect(client.testConnection()).resolves.toBe(true);
  });
});

describe("NetBirdClient — CRUD passthroughs", () => {
  it("createGroup, createPostureCheck, createPolicy, createRoute round-trip", async () => {
    server.use(
      http.post(`${BASE}/groups`, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({
          id: "g-new",
          name: body.name,
          peers_count: 0,
          resources_count: 0,
          issued: "api",
          peers: [],
          resources: [],
        });
      }),
      http.put(`${BASE}/groups/:id`, ({ params }) =>
        HttpResponse.json({
          id: params.id,
          name: "updated",
          peers_count: 0,
          resources_count: 0,
          issued: "api",
          peers: [],
          resources: [],
        })
      ),
      http.post(`${BASE}/posture-checks`, () =>
        HttpResponse.json({
          id: "pc-new",
          name: "x",
          description: "",
          checks: {},
        })
      ),
      http.put(`${BASE}/posture-checks/:id`, () =>
        HttpResponse.json({ id: "pc-new", name: "x", description: "", checks: {} })
      ),
      http.post(`${BASE}/policies`, () =>
        HttpResponse.json({
          id: "p-new",
          name: "",
          description: "",
          enabled: true,
          rules: [],
        })
      ),
      http.put(`${BASE}/policies/:id`, ({ params }) =>
        HttpResponse.json({
          id: params.id,
          name: "",
          description: "",
          enabled: true,
          rules: [],
        })
      ),
      http.post(`${BASE}/routes`, () =>
        HttpResponse.json({
          id: "r-new",
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
        })
      ),
      http.put(`${BASE}/routes/:id`, ({ params }) =>
        HttpResponse.json({
          id: params.id,
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
        })
      ),
      http.post(`${BASE}/dns/nameservers`, () =>
        HttpResponse.json({
          id: "dns-new",
          name: "",
          description: "",
          nameservers: [],
          enabled: true,
          groups: [],
          primary: false,
          domains: [],
          search_domains_enabled: false,
        })
      ),
      http.put(`${BASE}/dns/nameservers/:id`, ({ params }) =>
        HttpResponse.json({
          id: params.id,
          name: "",
          description: "",
          nameservers: [],
          enabled: true,
          groups: [],
          primary: false,
          domains: [],
          search_domains_enabled: false,
        })
      ),
      http.put(`${BASE}/dns/settings`, async ({ request }) =>
        HttpResponse.json(await request.json())
      ),
      http.post(`${BASE}/dns/zones`, () =>
        HttpResponse.json({
          id: "z-new",
          name: "",
          domain: "",
          enabled: true,
          enable_search_domain: false,
          distribution_groups: [],
          records: [],
        })
      ),
      http.put(`${BASE}/dns/zones/:id`, ({ params }) =>
        HttpResponse.json({
          id: params.id,
          name: "",
          domain: "",
          enabled: true,
          enable_search_domain: false,
          distribution_groups: [],
          records: [],
        })
      ),
      http.get(`${BASE}/dns/zones/:id/records`, () =>
        HttpResponse.json([])
      ),
      http.post(`${BASE}/dns/zones/:id/records`, () =>
        HttpResponse.json({ id: "rec-new", name: "", type: "A", content: "", ttl: 60 })
      ),
      http.post(`${BASE}/networks`, () =>
        HttpResponse.json({
          id: "net-new",
          name: "",
          description: "",
          routers: [],
          resources: [],
          routing_peers_count: 0,
          policies: [],
        })
      ),
      http.post(`${BASE}/networks/:id/resources`, () =>
        HttpResponse.json({
          id: "nres-new",
          name: "",
          description: "",
          type: "host",
          address: "",
          groups: [],
        })
      ),
      http.post(`${BASE}/networks/:id/routers`, () =>
        HttpResponse.json({
          id: "router-new",
          peer: "",
          peer_groups: [],
          metric: 9999,
          masquerade: true,
        })
      ),
      http.put(`${BASE}/accounts/:id`, ({ params }) =>
        HttpResponse.json({
          id: params.id,
          settings: {},
        })
      )
    );

    const client = new NetBirdClient("tok", BASE);

    await expect(
      client.createGroup({ name: "devs" })
    ).resolves.toMatchObject({ id: "g-new" });
    await expect(
      client.updateGroup("g-1", { name: "devs" })
    ).resolves.toMatchObject({ id: "g-1" });

    await expect(
      client.createPostureCheck({ name: "p", description: "", checks: {} })
    ).resolves.toMatchObject({ id: "pc-new" });
    await expect(
      client.updatePostureCheck("pc-1", {
        name: "p",
        description: "",
        checks: {},
      })
    ).resolves.toMatchObject({ id: "pc-new" });

    await expect(
      client.createPolicy({
        name: "x",
        description: "",
        enabled: true,
        rules: [],
      })
    ).resolves.toMatchObject({ id: "p-new" });
    await expect(
      client.updatePolicy("p-1", {
        name: "x",
        description: "",
        enabled: true,
        rules: [],
      })
    ).resolves.toMatchObject({ id: "p-1" });

    await expect(
      client.createRoute({
        name: "x",
        description: "",
        network_id: "",
        network: "",
        enabled: true,
        peer_groups: [],
        metric: 9999,
        masquerade: true,
        groups: [],
        keep_route: false,
      })
    ).resolves.toMatchObject({ id: "r-new" });
    await expect(
      client.updateRoute("r-1", {
        name: "x",
        description: "",
        network_id: "",
        network: "",
        enabled: true,
        peer_groups: [],
        metric: 9999,
        masquerade: true,
        groups: [],
        keep_route: false,
      })
    ).resolves.toMatchObject({ id: "r-1" });

    await expect(
      client.createDNSNameserverGroup({
        name: "x",
        description: "",
        nameservers: [],
        enabled: true,
        groups: [],
        primary: false,
        domains: [],
        search_domains_enabled: false,
      })
    ).resolves.toMatchObject({ id: "dns-new" });
    await expect(
      client.updateDNSNameserverGroup("dns-1", {
        name: "x",
        description: "",
        nameservers: [],
        enabled: true,
        groups: [],
        primary: false,
        domains: [],
        search_domains_enabled: false,
      })
    ).resolves.toMatchObject({ id: "dns-1" });

    await expect(
      client.updateDNSSettings({ disabled_management_groups: ["g1"] })
    ).resolves.toMatchObject({ disabled_management_groups: ["g1"] });

    await expect(
      client.createDNSZone({
        name: "z",
        domain: "z.example.com",
        enabled: true,
        enable_search_domain: false,
        distribution_groups: [],
      })
    ).resolves.toMatchObject({ id: "z-new" });
    await expect(
      client.updateDNSZone("z-1", {
        name: "z",
        domain: "z.example.com",
        enabled: true,
        enable_search_domain: false,
        distribution_groups: [],
      })
    ).resolves.toMatchObject({ id: "z-1" });

    await expect(client.getDNSZoneRecords("z-1")).resolves.toEqual([]);
    await expect(
      client.createDNSZoneRecord("z-1", {
        name: "n",
        type: "A",
        content: "1.1.1.1",
        ttl: 60,
      })
    ).resolves.toMatchObject({ id: "rec-new" });

    await expect(
      client.createNetwork({ name: "n", description: "" })
    ).resolves.toMatchObject({ id: "net-new" });
    await expect(
      client.createNetworkResource("net-new", {
        name: "x",
        description: "",
        type: "host",
        address: "",
        groups: [],
      })
    ).resolves.toMatchObject({ id: "nres-new" });
    await expect(
      client.createNetworkRouter("net-new", {
        peer_groups: [],
        metric: 9999,
        masquerade: true,
      })
    ).resolves.toMatchObject({ id: "router-new" });

    await expect(
      client.updateAccount("acct-1", { dns_domain: "x" })
    ).resolves.toMatchObject({ id: "acct-1" });
  });
});

describe("NetBirdClient — getAllResources", () => {
  it("aggregates every list endpoint plus per-network sub-resources", async () => {
    server.use(
      http.get(`${BASE}/groups`, () =>
        HttpResponse.json([
          {
            id: "g1",
            name: "Devs",
            peers_count: 0,
            resources_count: 0,
            issued: "api",
            peers: [],
            resources: [],
          },
        ])
      ),
      http.get(`${BASE}/posture-checks`, () => HttpResponse.json([])),
      http.get(`${BASE}/policies`, () => HttpResponse.json([])),
      http.get(`${BASE}/routes`, () => HttpResponse.json([])),
      http.get(`${BASE}/dns/nameservers`, () => HttpResponse.json([])),
      http.get(`${BASE}/dns/zones`, () => HttpResponse.json([])),
      http.get(`${BASE}/dns/settings`, () =>
        HttpResponse.json({ disabled_management_groups: [] })
      ),
      http.get(`${BASE}/networks`, () =>
        HttpResponse.json([
          {
            id: "n1",
            name: "main",
            description: "",
            routers: [],
            resources: [],
            routing_peers_count: 0,
            policies: [],
          },
        ])
      ),
      http.get(`${BASE}/networks/:id/resources`, () => HttpResponse.json([])),
      http.get(`${BASE}/networks/:id/routers`, () => HttpResponse.json([])),
      http.get(`${BASE}/reverse-proxies/domains`, () => HttpResponse.json([])),
      http.get(`${BASE}/reverse-proxies/services`, () => HttpResponse.json([])),
      http.get(`${BASE}/accounts`, () =>
        HttpResponse.json([
          {
            id: "acct-1",
            settings: {
              peer_login_expiration_enabled: true,
              peer_login_expiration: 86400,
              dns_domain: "netbird.cloud",
            },
          },
        ])
      )
    );

    const client = new NetBirdClient("tok", BASE);
    const out = await client.getAllResources();

    expect(out.groups).toHaveLength(1);
    expect(out.networks[0].resources).toEqual([]);
    expect(out.networks[0].routers).toEqual([]);
    expect(out.account_settings?.dns_domain).toBe("netbird.cloud");
  });

  it("survives optional endpoint failures without throwing", async () => {
    server.use(
      http.get(`${BASE}/groups`, () => HttpResponse.json([])),
      http.get(`${BASE}/posture-checks`, () => HttpResponse.json({ message: "boom" }, { status: 500 })),
      http.get(`${BASE}/policies`, () => HttpResponse.json([])),
      http.get(`${BASE}/routes`, () => HttpResponse.json([])),
      http.get(`${BASE}/dns/nameservers`, () => HttpResponse.json([])),
      http.get(`${BASE}/dns/zones`, () => HttpResponse.json({ message: "boom" }, { status: 500 })),
      http.get(`${BASE}/dns/settings`, () => HttpResponse.json({ message: "boom" }, { status: 500 })),
      http.get(`${BASE}/networks`, () => HttpResponse.json([])),
      http.get(`${BASE}/reverse-proxies/domains`, () => HttpResponse.json({ message: "boom" }, { status: 500 })),
      http.get(`${BASE}/reverse-proxies/services`, () => HttpResponse.json({ message: "boom" }, { status: 500 })),
      http.get(`${BASE}/accounts`, () => HttpResponse.json({ message: "boom" }, { status: 500 }))
    );

    const client = new NetBirdClient("tok", BASE);
    const out = await client.getAllResources();

    // Optional endpoints collapse to empty / undefined rather than blowing up.
    expect(out.posture_checks).toEqual([]);
    expect(out.dns_zones).toEqual([]);
    expect(out.dns_settings).toBeUndefined();
    expect(out.reverse_proxy_domains).toEqual([]);
    expect(out.reverse_proxy_services).toEqual([]);
    expect(out.account_settings).toBeUndefined();
  });
});

// Touch delay to silence MSW unused-import warnings on some platforms.
void delay;
