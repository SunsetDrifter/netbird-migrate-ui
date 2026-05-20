import { describe, expect, it } from "vitest";
import { MigrationEngine } from "./migration-engine";
import {
  RecordingMockClient,
  asNetBirdClient,
} from "@/tests/mocks/recording-client";
import {
  makeAccount,
  makeAccountSettings,
  makeDNS,
  makeDNSSettings,
  makeDNSZone,
  makeFullSourceResources,
  makeGroup,
  makeNetwork,
  makePolicy,
  makeReverseProxyDomain,
  makeReverseProxyService,
  makeRoute,
} from "@/tests/fixtures/netbird";
import type {
  Conflict,
  MigrationEvent,
  ResourceSelection,
  SourceResources,
} from "./types";

function fullSelection(resources: SourceResources): ResourceSelection {
  return {
    groups: resources.groups.map((g) => g.id),
    posture_checks: resources.posture_checks.map((p) => p.id),
    policies: resources.policies.map((p) => p.id),
    routes: resources.routes.map((r) => r.id),
    dns: resources.dns.map((d) => d.id),
    dns_zones: resources.dns_zones.map((z) => z.id),
    dns_settings: resources.dns_settings?.disabled_management_groups?.length
      ? ["disabled_management_groups"]
      : [],
    networks: resources.networks.map((n) => n.id),
    reverse_proxy_domains: resources.reverse_proxy_domains.map((d) => d.id),
    reverse_proxy_services: resources.reverse_proxy_services
      .filter((s) => s.source !== "ephemeral")
      .map((s) => s.id),
    account_settings: [
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
    ],
  };
}

function makeEngine(opts: {
  source?: RecordingMockClient;
  dest: RecordingMockClient;
}) {
  const events: MigrationEvent[] = [];
  const source =
    opts.source ?? new RecordingMockClient();
  const engine = new MigrationEngine(
    asNetBirdClient(source),
    asNetBirdClient(opts.dest),
    (e) => events.push(e)
  );
  return { engine, events };
}

describe("MigrationEngine — happy path", () => {
  it("creates every selected resource when destination is empty", async () => {
    const resources = makeFullSourceResources();
    const dest = new RecordingMockClient({
      destAccounts: [makeAccount()],
    });
    const { engine } = makeEngine({ dest });

    const result = await engine.execute(
      resources,
      fullSelection(resources),
      []
    );

    expect(result.failed).toBe(0);
    expect(result.created).toBeGreaterThan(0);
    // Each top-level resource type should produce at least one create call.
    expect(dest.callsOf("createGroup").length).toBe(2);
    expect(dest.callsOf("createPostureCheck").length).toBe(1);
    expect(dest.callsOf("createPolicy").length).toBe(1);
    expect(dest.callsOf("createRoute").length).toBe(1);
    expect(dest.callsOf("createDNSNameserverGroup").length).toBe(1);
    expect(dest.callsOf("createDNSZone").length).toBe(1);
    expect(dest.callsOf("createNetwork").length).toBe(1);
    expect(dest.callsOf("createReverseProxyDomain").length).toBe(1);
    expect(dest.callsOf("createReverseProxyService").length).toBe(1);
  });
});

describe("MigrationEngine — conflict resolution", () => {
  it("skip resolution does not create the resource", async () => {
    const resources = makeFullSourceResources({
      groups: [makeGroup({ id: "g1", name: "Developers" })],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });
    const dest = new RecordingMockClient({
      destGroups: [makeGroup({ id: "dest-g1", name: "Developers" })],
    });
    const conflicts: Conflict[] = [
      {
        resourceType: "groups",
        sourceId: "g1",
        sourceName: "Developers",
        destinationId: "dest-g1",
        resolution: "skip",
      },
    ];

    const { engine } = makeEngine({ dest });
    const result = await engine.execute(
      resources,
      {
        ...fullSelection(resources),
        account_settings: [],
      },
      conflicts
    );

    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(dest.callsOf("createGroup")).toHaveLength(0);
    expect(dest.callsOf("updateGroup")).toHaveLength(0);
  });

  it("overwrite resolution triggers PUT, not POST", async () => {
    const resources = makeFullSourceResources({
      groups: [makeGroup({ id: "g1", name: "Developers" })],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });
    const dest = new RecordingMockClient({
      destGroups: [makeGroup({ id: "dest-g1", name: "Developers" })],
    });
    const conflicts: Conflict[] = [
      {
        resourceType: "groups",
        sourceId: "g1",
        sourceName: "Developers",
        destinationId: "dest-g1",
        resolution: "overwrite",
      },
    ];

    const { engine } = makeEngine({ dest });
    await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      conflicts
    );

    expect(dest.callsOf("createGroup")).toHaveLength(0);
    expect(dest.callsOf("updateGroup")).toHaveLength(1);
  });
});

describe("MigrationEngine — ID mapping", () => {
  it("translates source group IDs to destination IDs in policy rules", async () => {
    const resources = makeFullSourceResources({
      groups: [
        makeGroup({ id: "src-g1", name: "Developers" }),
        makeGroup({ id: "src-g2", name: "Prod" }),
      ],
      posture_checks: [],
      policies: [
        makePolicy({
          id: "src-pol-1",
          name: "Allow",
          rules: [
            {
              id: "src-rule-1",
              name: "rule",
              enabled: true,
              action: "accept",
              protocol: "tcp",
              bidirectional: true,
              sources: [{ id: "src-g1", name: "Developers" }],
              destinations: [{ id: "src-g2", name: "Prod" }],
              ports: [],
            },
          ],
          source_posture_checks: [],
        }),
      ],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const { engine } = makeEngine({ dest });

    await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    const policyCalls = dest.callsOf("createPolicy");
    expect(policyCalls).toHaveLength(1);
    const policyBody = policyCalls[0].args[0] as {
      rules: { sources: string[]; destinations: string[] }[];
    };

    // After ID mapping, every referenced ID must be a destination ID, not a source one.
    expect(policyBody.rules[0].sources.some((id) => id.startsWith("src-")))
      .toBe(false);
    expect(policyBody.rules[0].destinations.some((id) => id.startsWith("src-")))
      .toBe(false);
    expect(policyBody.rules[0].sources).toHaveLength(1);
    expect(policyBody.rules[0].destinations).toHaveLength(1);
  });

  it("translates source group IDs in route peer_groups and groups", async () => {
    const resources = makeFullSourceResources({
      groups: [makeGroup({ id: "g1", name: "Devs" })],
      posture_checks: [],
      policies: [],
      routes: [
        makeRoute({
          id: "r1",
          name: "r",
          peer_groups: ["g1"],
          groups: ["g1"],
        }),
      ],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const { engine } = makeEngine({ dest });

    await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    const body = dest.callsOf("createRoute")[0].args[0] as {
      peer_groups: string[];
      groups: string[];
    };

    expect(body.peer_groups.some((id) => id.startsWith("g1"))).toBe(false);
    expect(body.peer_groups).toHaveLength(1);
    expect(body.groups).toHaveLength(1);
  });

  it("translates IDs in DNS nameserver group references", async () => {
    const resources = makeFullSourceResources({
      groups: [makeGroup({ id: "g1", name: "Devs" })],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [
        makeDNS({
          id: "d1",
          name: "Cloudflare",
          groups: ["g1"],
        }),
      ],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const { engine } = makeEngine({ dest });

    await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    const body = dest.callsOf("createDNSNameserverGroup")[0].args[0] as {
      groups: string[];
    };
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].startsWith("g1")).toBe(false);
  });
});

describe("MigrationEngine — pre-existing destination resources", () => {
  it("uses an existing same-name destination group instead of creating a duplicate", async () => {
    const resources = makeFullSourceResources({
      groups: [makeGroup({ id: "src-g1", name: "Developers" })],
      posture_checks: [],
      policies: [
        makePolicy({
          id: "src-pol-1",
          name: "Allow",
          rules: [
            {
              id: "src-rule-1",
              name: "rule",
              enabled: true,
              action: "accept",
              protocol: "tcp",
              bidirectional: true,
              sources: [{ id: "src-g1", name: "Developers" }],
              destinations: [{ id: "src-g1", name: "Developers" }],
              ports: [],
            },
          ],
        }),
      ],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient({
      // Case-insensitive name match — note the casing difference.
      destGroups: [makeGroup({ id: "preexisting-g1", name: "developers" })],
    });

    const { engine } = makeEngine({ dest });
    await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    expect(dest.callsOf("createGroup")).toHaveLength(0);

    const body = dest.callsOf("createPolicy")[0].args[0] as {
      rules: { sources: string[] }[];
    };
    expect(body.rules[0].sources).toEqual(["preexisting-g1"]);
  });
});

describe("MigrationEngine — 409 already-exists short-circuit", () => {
  it("treats 'already exists' route errors as skipped, not failed", async () => {
    const resources = makeFullSourceResources({
      groups: [],
      posture_checks: [],
      policies: [],
      routes: [makeRoute({ id: "r1", name: "r1" })],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient({
      throwOn: {
        createRoute: new Error("Route already exists (409)"),
      },
    });

    const { engine } = makeEngine({ dest });
    const result = await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    expect(result.failed).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });
});

describe("MigrationEngine — Networks", () => {
  it("does not attempt PUT on networks (no update API)", async () => {
    const resources = makeFullSourceResources({
      groups: [],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [makeNetwork({ id: "n1", name: "main" })],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const conflicts: Conflict[] = [
      {
        resourceType: "networks",
        sourceId: "n1",
        sourceName: "main",
        destinationId: "dest-n1",
        resolution: "overwrite",
      },
    ];

    const { engine, events } = makeEngine({ dest });
    const result = await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      conflicts
    );

    expect(dest.callsOf("createNetwork")).toHaveLength(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(
      events.some((e) => e.message?.includes("cannot update in-place"))
    ).toBe(true);
  });
});

describe("MigrationEngine — Reverse Proxy", () => {
  it("creates the domain before the service", async () => {
    const resources = makeFullSourceResources({
      groups: [makeGroup({ id: "g1", name: "Devs" })],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [
        makeReverseProxyDomain({ id: "d1", domain: "api.example.com" }),
      ],
      reverse_proxy_services: [
        makeReverseProxyService({
          id: "s1",
          name: "api",
          domain: "api.example.com",
          authentication: { userGroups: ["g1"] },
        }),
      ],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const { engine } = makeEngine({ dest });
    await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    const domainSeq = dest.callsOf("createReverseProxyDomain")[0].sequence;
    const serviceSeq = dest.callsOf("createReverseProxyService")[0].sequence;
    expect(domainSeq).toBeLessThan(serviceSeq);
  });

  it("skips ephemeral services with a progress event", async () => {
    const resources = makeFullSourceResources({
      groups: [],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [
        makeReverseProxyService({
          id: "ephem-1",
          name: "cli-expose",
          source: "ephemeral",
        }),
      ],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const { engine, events } = makeEngine({ dest });

    const result = await engine.execute(
      resources,
      {
        ...fullSelection(resources),
        reverse_proxy_services: ["ephem-1"],
        account_settings: [],
      },
      []
    );

    expect(dest.callsOf("createReverseProxyService")).toHaveLength(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(
      events.some((e) =>
        e.message?.toLowerCase().includes("ephemeral")
      )
    ).toBe(true);
  });

  it("maps userGroups through IdMapping when creating a service", async () => {
    const resources = makeFullSourceResources({
      groups: [makeGroup({ id: "src-g1", name: "Devs" })],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [
        makeReverseProxyDomain({ id: "d1", domain: "api.example.com" }),
      ],
      reverse_proxy_services: [
        makeReverseProxyService({
          id: "s1",
          name: "api",
          domain: "api.example.com",
          authentication: { userGroups: ["src-g1"] },
        }),
      ],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const { engine } = makeEngine({ dest });
    await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    const body = dest.callsOf("createReverseProxyService")[0].args[0] as {
      authentication?: { userGroups?: string[] };
    };

    expect(body.authentication?.userGroups).toBeDefined();
    expect(body.authentication?.userGroups).toHaveLength(1);
    expect(body.authentication?.userGroups?.[0].startsWith("src-")).toBe(false);
  });

  it("skips an existing same-name service when not overwriting", async () => {
    const resources = makeFullSourceResources({
      groups: [],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [
        makeReverseProxyService({
          id: "s1",
          name: "api",
          source: "permanent",
        }),
      ],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient({
      destReverseProxyServices: [
        makeReverseProxyService({ id: "dest-s1", name: "API" }),
      ],
    });

    const { engine } = makeEngine({ dest });
    const result = await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    expect(dest.callsOf("createReverseProxyService")).toHaveLength(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });
});

describe("MigrationEngine — DNS settings", () => {
  it("maps disabled_management_groups through IdMapping", async () => {
    const resources = makeFullSourceResources({
      groups: [makeGroup({ id: "src-g1", name: "Devs" })],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: makeDNSSettings({ disabled_management_groups: ["src-g1"] }),
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const { engine } = makeEngine({ dest });
    await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    const body = dest.callsOf("updateDNSSettings")[0].args[0] as {
      disabled_management_groups: string[];
    };
    expect(body.disabled_management_groups[0].startsWith("src-")).toBe(false);
  });
});

describe("MigrationEngine — DNS zones", () => {
  it("creates records under the newly created zone", async () => {
    const resources = makeFullSourceResources({
      groups: [],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [
        makeDNSZone({
          id: "z1",
          name: "Internal",
          records: [
            { id: "r1", name: "app", type: "A", content: "10.0.0.10", ttl: 300 },
            { id: "r2", name: "db", type: "A", content: "10.0.0.11", ttl: 300 },
          ],
        }),
      ],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const { engine } = makeEngine({ dest });
    await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    expect(dest.callsOf("createDNSZone")).toHaveLength(1);
    expect(dest.callsOf("createDNSZoneRecord")).toHaveLength(2);
  });
});

describe("MigrationEngine — real-world API shape quirks", () => {
  it("tolerates null arrays from the NetBird API on policy rules", async () => {
    const resources = makeFullSourceResources({
      groups: [makeGroup({ id: "g1", name: "Devs" })],
      posture_checks: [],
      policies: [
        makePolicy({
          id: "pol-1",
          name: "Sparse",
          rules: [
            {
              id: "rule-1",
              name: "r",
              enabled: true,
              action: "accept",
              protocol: "tcp",
              bidirectional: true,
              sources: [{ id: "g1", name: "Devs" }],
              destinations: [{ id: "g1", name: "Devs" }],
              // NetBird returns null, not [] or missing.
              ports: null as unknown as string[],
              source_posture_checks: null,
            },
          ],
          source_posture_checks: null,
        }),
      ],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const { engine } = makeEngine({ dest });
    const result = await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    expect(result.failed).toBe(0);
    expect(dest.callsOf("createPolicy")).toHaveLength(1);
    const body = dest.callsOf("createPolicy")[0].args[0] as {
      rules: { ports: string[] }[];
    };
    expect(body.rules[0].ports).toEqual([]);
  });

  it("emits a warning and skips a policy whose rule destination is a network resource", async () => {
    const resources = makeFullSourceResources({
      groups: [makeGroup({ id: "g1", name: "Devs" })],
      posture_checks: [],
      policies: [
        makePolicy({
          id: "pol-1",
          name: "File Server Access",
          rules: [
            {
              id: "rule-1",
              name: "File Server Access",
              enabled: true,
              action: "accept",
              protocol: "tcp",
              bidirectional: false,
              sources: [{ id: "g1", name: "Devs" }],
              destinations: null,
              destinationResource: { id: "nres-1", type: "host" },
              ports: ["443"],
            },
          ],
        }),
      ],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: undefined,
    });

    const dest = new RecordingMockClient();
    const { engine, events } = makeEngine({ dest });
    const result = await engine.execute(
      resources,
      { ...fullSelection(resources), account_settings: [] },
      []
    );

    expect(dest.callsOf("createPolicy")).toHaveLength(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(
      events.some((e) =>
        e.message?.includes("references a network resource")
      )
    ).toBe(true);
    expect(
      events.some((e) =>
        e.message?.includes("no rule has both sources and destinations")
      )
    ).toBe(true);
  });
});

describe("MigrationEngine — account settings", () => {
  it("merges with existing destination settings rather than replacing them", async () => {
    const resources = makeFullSourceResources({
      groups: [],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: makeAccountSettings({ dns_domain: "new.netbird.cloud" }),
    });

    const dest = new RecordingMockClient({
      destAccounts: [
        makeAccount({
          id: "dest-acct-1",
          settings: {
            ...makeAccountSettings({ dns_domain: "old.netbird.cloud" }),
            mystery_field: "should-survive",
          } as never,
        }),
      ],
    });

    const { engine } = makeEngine({ dest });
    await engine.execute(
      resources,
      {
        ...fullSelection(resources),
        account_settings: ["dns_domain"],
      },
      []
    );

    const call = dest.callsOf("updateAccount")[0];
    const [acctId, merged] = call.args as [string, Record<string, unknown>];
    expect(acctId).toBe("dest-acct-1");
    expect(merged.dns_domain).toBe("new.netbird.cloud");
    // Unmanaged destination fields are preserved.
    expect(merged.mystery_field).toBe("should-survive");
  });

  it("translates all group-referencing account settings into destination group IDs", async () => {
    const resources = makeFullSourceResources({
      groups: [
        makeGroup({ id: "src-g1", name: "Developers" }),
        makeGroup({ id: "src-g2", name: "Servers" }),
      ],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: makeAccountSettings({
        jwt_allow_groups: ["src-g1", "src-g2"],
        peer_expose_groups: ["src-g1"],
        extra: {
          peer_approval_enabled: false,
          user_approval_required: false,
          network_traffic_logs_enabled: true,
          network_traffic_logs_groups: ["src-g2"],
          network_traffic_packet_counter_enabled: false,
        },
      }),
    });

    const dest = new RecordingMockClient({
      destAccounts: [makeAccount()],
    });

    const { engine } = makeEngine({ dest });
    await engine.execute(
      resources,
      {
        ...fullSelection(resources),
        groups: ["src-g1", "src-g2"],
        account_settings: ["jwt_allow_groups", "peer_expose_groups", "network_traffic_logs"],
      },
      []
    );

    const call = dest.callsOf("updateAccount")[0];
    const merged = call.args[1] as Record<string, unknown>;
    const extra = merged.extra as Record<string, unknown>;
    const expectAllDestIds = (label: string, ids: string[]) => {
      for (const id of ids) {
        expect(
          id.startsWith("dest-grp-"),
          `${label} leaked source id ${id}`
        ).toBe(true);
      }
    };
    const jwt = merged.jwt_allow_groups as string[];
    expect(jwt).toEqual(["dest-grp-1", "dest-grp-2"]);
    expectAllDestIds("jwt_allow_groups", jwt);

    const expose = merged.peer_expose_groups as string[];
    expect(expose).toEqual(["dest-grp-1"]);
    expectAllDestIds("peer_expose_groups", expose);

    const traffic = extra.network_traffic_logs_groups as string[];
    expect(traffic).toEqual(["dest-grp-2"]);
    expectAllDestIds("network_traffic_logs_groups", traffic);
    expect(extra.network_traffic_logs_enabled).toBe(true);
  });

  it("translates ipv6_enabled_groups source IDs into destination group IDs", async () => {
    const resources = makeFullSourceResources({
      groups: [
        makeGroup({ id: "src-g1", name: "Developers" }),
        makeGroup({ id: "src-g2", name: "Servers" }),
      ],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      dns_zones: [],
      networks: [],
      reverse_proxy_domains: [],
      reverse_proxy_services: [],
      dns_settings: { disabled_management_groups: [] },
      account_settings: makeAccountSettings({
        network_range_v6: "fd00::/8",
        ipv6_enabled_groups: ["src-g1", "src-g2"],
      }),
    });

    const dest = new RecordingMockClient({
      destAccounts: [makeAccount()],
    });

    const { engine } = makeEngine({ dest });
    await engine.execute(
      resources,
      {
        ...fullSelection(resources),
        groups: ["src-g1", "src-g2"],
        account_settings: ["network_range_v6", "ipv6_enabled_groups"],
      },
      []
    );

    const call = dest.callsOf("updateAccount")[0];
    const merged = call.args[1] as Record<string, unknown>;
    expect(merged.network_range_v6).toBe("fd00::/8");
    const mappedGroups = merged.ipv6_enabled_groups as string[];
    // Mock assigns dest-grp-N sequentially as createGroup is called.
    expect(mappedGroups).toEqual(["dest-grp-1", "dest-grp-2"]);
    // No source IDs leaked through.
    for (const id of mappedGroups) {
      expect(id.startsWith("src-")).toBe(false);
    }
  });
});
