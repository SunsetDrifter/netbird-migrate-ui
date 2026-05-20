import { describe, expect, it } from "vitest";
import { MigrationEngine } from "./migration-engine";
import {
  RecordingMockClient,
  asNetBirdClient,
  type RecordedCall,
} from "@/tests/mocks/recording-client";
import {
  makeAccount,
  makeFullSourceResources,
} from "@/tests/fixtures/netbird";
import type { MigrationEvent, ResourceSelection } from "./types";

/**
 * The migrator's correctness depends entirely on a strict dependency order.
 * Each test in this file isolates one piece of that order and asserts it
 * directly, so a future refactor can't silently re-order anything without
 * tripping a failing test.
 */

function fullSelectionForAll(): ResourceSelection {
  return {
    groups: ["src-grp-1", "src-grp-2"],
    posture_checks: ["src-pc-1"],
    policies: ["src-pol-1"],
    routes: ["src-rt-1"],
    dns: ["src-dns-1"],
    dns_zones: ["src-zone-1"],
    dns_settings: ["disabled_management_groups"],
    networks: ["src-net-1"],
    reverse_proxy_domains: ["src-rpd-1"],
    reverse_proxy_services: ["src-rps-1"],
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
      "lazy_connection_enabled",
    ],
  };
}

async function runFull(): Promise<{
  calls: RecordedCall[];
  events: MigrationEvent[];
}> {
  const resources = makeFullSourceResources();
  const dest = new RecordingMockClient({
    destAccounts: [makeAccount()],
  });
  const events: MigrationEvent[] = [];
  const engine = new MigrationEngine(
    asNetBirdClient(new RecordingMockClient()),
    asNetBirdClient(dest),
    (e) => events.push(e)
  );

  await engine.execute(resources, fullSelectionForAll(), []);
  return { calls: dest.calls, events };
}

function lastSeqOf(calls: RecordedCall[], method: string): number {
  const ms = calls.filter((c) => c.method === method);
  return ms.length ? ms[ms.length - 1].sequence : -1;
}

function firstSeqOf(calls: RecordedCall[], method: string): number {
  const m = calls.find((c) => c.method === method);
  return m ? m.sequence : Number.POSITIVE_INFINITY;
}

describe("ordering — group creation precedes anything that depends on group IDs", () => {
  it("all createGroup calls finish before the first createPolicy call", async () => {
    const { calls } = await runFull();
    expect(lastSeqOf(calls, "createGroup")).toBeLessThan(
      firstSeqOf(calls, "createPolicy")
    );
  });

  it("all createGroup calls finish before the first createRoute call", async () => {
    const { calls } = await runFull();
    expect(lastSeqOf(calls, "createGroup")).toBeLessThan(
      firstSeqOf(calls, "createRoute")
    );
  });

  it("all createGroup calls finish before the first createDNSNameserverGroup call", async () => {
    const { calls } = await runFull();
    expect(lastSeqOf(calls, "createGroup")).toBeLessThan(
      firstSeqOf(calls, "createDNSNameserverGroup")
    );
  });

  it("all createGroup calls finish before the first createDNSZone call (distribution_groups dependency)", async () => {
    const { calls } = await runFull();
    expect(lastSeqOf(calls, "createGroup")).toBeLessThan(
      firstSeqOf(calls, "createDNSZone")
    );
  });

  it("all createGroup calls finish before any updateDNSSettings call (disabled_management_groups dependency)", async () => {
    const { calls } = await runFull();
    expect(lastSeqOf(calls, "createGroup")).toBeLessThan(
      firstSeqOf(calls, "updateDNSSettings")
    );
  });
});

describe("ordering — posture checks precede policies", () => {
  it("all createPostureCheck calls finish before the first createPolicy call", async () => {
    const { calls } = await runFull();
    expect(lastSeqOf(calls, "createPostureCheck")).toBeLessThan(
      firstSeqOf(calls, "createPolicy")
    );
  });
});

describe("ordering — networks precede their nested resources/routers", () => {
  it("createNetwork precedes createNetworkResource", async () => {
    const { calls } = await runFull();
    expect(firstSeqOf(calls, "createNetwork")).toBeLessThan(
      firstSeqOf(calls, "createNetworkResource")
    );
  });

  it("createNetwork precedes createNetworkRouter", async () => {
    const { calls } = await runFull();
    expect(firstSeqOf(calls, "createNetwork")).toBeLessThan(
      firstSeqOf(calls, "createNetworkRouter")
    );
  });
});

describe("ordering — reverse proxy domains precede services", () => {
  it("all createReverseProxyDomain calls finish before the first createReverseProxyService call", async () => {
    const { calls } = await runFull();
    expect(lastSeqOf(calls, "createReverseProxyDomain")).toBeLessThan(
      firstSeqOf(calls, "createReverseProxyService")
    );
  });
});

describe("ordering — account update runs last", () => {
  it("updateAccount is the final mutation in the recorded sequence", async () => {
    const { calls } = await runFull();
    const mutations = calls.filter(
      (c) =>
        c.method.startsWith("create") ||
        c.method.startsWith("update")
    );
    expect(mutations.length).toBeGreaterThan(1);
    expect(mutations[mutations.length - 1].method).toBe("updateAccount");
  });
});

describe("ordering — no forward references in mutation payloads", () => {
  /**
   * For every recorded create/update call whose body references group IDs,
   * those IDs must already exist as either:
   *   (a) the destination ID of an earlier createGroup/updateGroup, or
   *   (b) the ID of a group pre-fetched from the destination.
   *
   * This guards against future refactors that lazily map IDs and end up
   * issuing requests that reference not-yet-created groups.
   */
  it("policy rules only reference already-created or pre-existing destination groups", async () => {
    const { calls } = await runFull();

    const knownGroupIds = new Set<string>();
    for (const call of calls) {
      if (call.method === "getGroups") {
        // RecordingMockClient returns its preset destGroups here.
        // Our fixture starts empty, so this is a no-op; left as a hook.
      }
      if (call.method === "createGroup" || call.method === "updateGroup") {
        // The mock returns a fresh dest-grp-N id; we capture it via the
        // mutations list captured below in a separate, deterministic scan.
      }
    }

    // Re-run with a captured-result mock to get the actual returned dest IDs.
    const localResources = makeFullSourceResources();
    const dest = new RecordingMockClient({
      destAccounts: [makeAccount()],
    });

    const events: MigrationEvent[] = [];
    const engine = new MigrationEngine(
      asNetBirdClient(new RecordingMockClient()),
      asNetBirdClient(dest),
      (e) => events.push(e)
    );

    await engine.execute(localResources, fullSelectionForAll(), []);

    // Reconstruct the set of created group IDs in sequence order by
    // pairing each createGroup call's argument with the dest-grp-N id
    // the mock assigns deterministically.
    let counter = 0;
    const newId = () => `dest-grp-${++counter}`;
    const sequencedGroupIds: { seq: number; id: string }[] = [];
    for (const call of dest.calls) {
      if (call.method === "createGroup") {
        sequencedGroupIds.push({ seq: call.sequence, id: newId() });
      }
    }

    // Policy create calls reference group IDs in rule sources/destinations.
    const policyCalls = dest.calls.filter((c) => c.method === "createPolicy");
    for (const policy of policyCalls) {
      const body = policy.args[0] as {
        rules: { sources: string[]; destinations: string[] }[];
      };
      const referencedIds = new Set<string>();
      for (const rule of body.rules) {
        for (const id of rule.sources) referencedIds.add(id);
        for (const id of rule.destinations) referencedIds.add(id);
      }

      const availableAtThisPoint = new Set(
        sequencedGroupIds
          .filter((g) => g.seq < policy.sequence)
          .map((g) => g.id)
      );

      for (const refId of referencedIds) {
        expect(
          availableAtThisPoint.has(refId),
          `policy rule references group ${refId} not yet created by sequence ${policy.sequence}`
        ).toBe(true);
      }
    }
  });
});

describe("ordering — invariants don't depend on resource quantity", () => {
  it("holds when there are many groups followed by many policies", async () => {
    const many = makeFullSourceResources({
      groups: Array.from({ length: 5 }, (_, i) => ({
        id: `g${i}`,
        name: `Group${i}`,
        peers_count: 0,
        resources_count: 0,
        issued: "api",
        peers: [],
        resources: [],
      })),
    });

    const dest = new RecordingMockClient({
      destAccounts: [makeAccount()],
    });
    const engine = new MigrationEngine(
      asNetBirdClient(new RecordingMockClient()),
      asNetBirdClient(dest),
      () => {}
    );

    await engine.execute(many, {
      ...fullSelectionForAll(),
      groups: many.groups.map((g) => g.id),
    }, []);

    expect(lastSeqOf(dest.calls, "createGroup")).toBeLessThan(
      firstSeqOf(dest.calls, "createPolicy")
    );
  });
});
