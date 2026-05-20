import type { Page, Route } from "@playwright/test";
import type { SourceResources } from "@/lib/types";

export interface NetBirdMockOptions {
  resources?: Partial<SourceResources>;
  // Override the default 200 response for /api/connect.
  connectStatus?: number;
  connectError?: string;
}

const baseResources = (): SourceResources => ({
  groups: [
    {
      id: "src-grp-all",
      name: "All",
      peers_count: 0,
      resources_count: 0,
      issued: "api",
      peers: null,
      resources: null,
    },
    {
      id: "src-grp-1",
      name: "IT Admins",
      peers_count: 3,
      resources_count: 0,
      issued: "api",
      peers: null,
      resources: null,
    },
    {
      id: "src-grp-2",
      name: "Developers",
      peers_count: 5,
      resources_count: 0,
      issued: "api",
      peers: null,
      resources: null,
    },
  ],
  posture_checks: [
    {
      id: "src-pc-1",
      name: "macOS only",
      description: "Require macOS",
      checks: {},
    },
  ],
  policies: [
    {
      id: "src-pol-1",
      name: "Default",
      description: "Default allow",
      enabled: true,
      rules: [
        {
          id: "src-rule-1",
          name: "default",
          enabled: true,
          action: "accept",
          protocol: "all",
          bidirectional: true,
          sources: [{ id: "src-grp-all", name: "All" }],
          destinations: [{ id: "src-grp-all", name: "All" }],
          ports: [],
        },
      ],
    },
  ],
  routes: [],
  dns: [],
  dns_zones: [],
  networks: [
    {
      id: "src-net-1",
      name: "Office Network",
      description: "Main office",
      routers: [],
      resources: [],
      routing_peers_count: 0,
      policies: [],
    },
  ],
  reverse_proxy_domains: [],
  reverse_proxy_services: [],
  account_settings: undefined,
  dns_settings: undefined,
});

/**
 * Installs Playwright route handlers that mock every `/api/*` endpoint the
 * wizard calls. Tests can compose this with overrides for specific scenarios.
 */
export async function mockNetBirdApi(
  page: Page,
  opts: NetBirdMockOptions = {}
): Promise<void> {
  const resources = {
    ...baseResources(),
    ...opts.resources,
  };

  await page.route("**/api/connect", async (route: Route) => {
    if (opts.connectStatus && opts.connectStatus !== 200) {
      await route.fulfill({
        status: opts.connectStatus,
        contentType: "application/json",
        body: JSON.stringify({ error: opts.connectError || "Connection failed" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route("**/api/resources", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(resources),
    });
  });

  // /api/destination drives conflict detection. Return an empty destination by
  // default so the wizard produces zero conflicts and goes straight to the
  // "Start Migration" button.
  await page.route("**/api/destination", async (route: Route) => {
    const emptyDest = {
      groups: [],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyDest),
    });
  });

  await page.route("**/api/migrate", async (route: Route) => {
    // Construct an SSE-formatted body with realistic-looking events.
    const events = [
      {
        type: "success",
        resourceType: "groups",
        resourceName: "IT Admins",
        message: "Created group: IT Admins",
      },
      {
        type: "success",
        resourceType: "groups",
        resourceName: "Developers",
        message: "Created group: Developers",
      },
      {
        type: "success",
        resourceType: "posture_checks",
        resourceName: "macOS only",
        message: "Created posture check: macOS only",
      },
      {
        type: "success",
        resourceType: "policies",
        resourceName: "Default",
        message: "Created policy: Default",
      },
      {
        type: "success",
        resourceType: "networks",
        resourceName: "Office Network",
        message: "Created network: Office Network",
      },
      {
        type: "complete",
        message: "Migration complete: 5 created, 0 skipped, 0 failed",
        created: 5,
        skipped: 0,
        failed: 0,
      },
    ];
    const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache", Connection: "keep-alive" },
      body,
    });
  });
}
