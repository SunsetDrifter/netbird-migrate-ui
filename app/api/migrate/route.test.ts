import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Replace NetBirdClient with the recording mock so the route's `new
// NetBirdClient(...)` calls don't hit the network. vi.mock is hoisted above
// the route import below.
vi.mock("@/lib/netbird-client", async () => {
  const mockModule = await import("@/tests/mocks/recording-client");
  return { NetBirdClient: mockModule.RecordingMockClient };
});

import { POST } from "./route";
import { makeFullSourceResources } from "@/tests/fixtures/netbird";
import type { MigrationEvent, ResourceSelection } from "@/lib/types";

// Each call uses a fresh client IP so the per-IP rate limiter doesn't trip
// across tests. The rate-limiter keys on (ip, path); tests all hit
// /api/migrate so we just rotate IPs.
let testIpCounter = 0;
function makeRequest(body: unknown): NextRequest {
  testIpCounter++;
  return new NextRequest("http://localhost:3000/api/migrate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.99.${(testIpCounter >> 8) & 0xff}.${testIpCounter & 0xff}`,
    },
    body: JSON.stringify(body),
  });
}

async function readSSEEvents(
  body: ReadableStream<Uint8Array> | null
): Promise<MigrationEvent[]> {
  if (!body) return [];
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: MigrationEvent[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
      if (dataLine) {
        events.push(JSON.parse(dataLine.slice(6)) as MigrationEvent);
      }
    }
  }
  return events;
}

const emptySelection = (): ResourceSelection => ({
  groups: [],
  posture_checks: [],
  policies: [],
  routes: [],
  dns: [],
  dns_zones: [],
  dns_settings: [],
  networks: [],
  reverse_proxy_domains: [],
  reverse_proxy_services: [],
  account_settings: [],
});

describe("POST /api/migrate — validation", () => {
  beforeEach(() => {
    // Bump the rate-limiter window per test by using a unique IP-equivalent
    // path key. Rate limiter is keyed on (ip, path), so unique paths help, but
    // since these all hit /api/migrate we just stay under the 5/min budget.
  });

  it("returns 400 on a malformed body (not JSON)", async () => {
    testIpCounter++;
    const req = new NextRequest("http://localhost:3000/api/migrate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.99.${(testIpCounter >> 8) & 0xff}.${testIpCounter & 0xff}`,
      },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when destToken is missing", async () => {
    const res = await POST(
      makeRequest({
        destUrl: "https://api.netbird.io/api",
        resources: makeFullSourceResources(),
        selection: emptySelection(),
        conflicts: [],
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when destUrl is a private IP", async () => {
    const res = await POST(
      makeRequest({
        destToken: "dest-tok",
        destUrl: "https://10.0.0.1/api",
        resources: makeFullSourceResources(),
        selection: emptySelection(),
        conflicts: [],
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.toLowerCase()).toContain("destination");
  });

  it("returns 400 when conflicts is not an array", async () => {
    const res = await POST(
      makeRequest({
        destToken: "dest-tok",
        destUrl: "https://api.netbird.io/api",
        resources: makeFullSourceResources(),
        selection: emptySelection(),
        conflicts: "nope",
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/migrate — SSE stream", () => {
  it("streams events and ends with a 'complete' event", async () => {
    const resources = makeFullSourceResources();
    const req = makeRequest({
      // Import-only payload: no source credentials, all resources provided.
      sourceToken: "",
      sourceUrl: "",
      destToken: "dest-tok",
      destUrl: "https://api.netbird.io/api",
      resources,
      selection: {
        ...emptySelection(),
        groups: resources.groups.map((g) => g.id),
      },
      conflicts: [],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await readSSEEvents(res.body);

    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1];
    expect(last.type).toBe("complete");
    expect(last.created).toBeGreaterThanOrEqual(0);
    expect(last.skipped).toBeGreaterThanOrEqual(0);
    expect(last.failed).toBeGreaterThanOrEqual(0);
  });

  it("accepts a payload with source credentials and a full URL", async () => {
    const resources = makeFullSourceResources();
    const req = makeRequest({
      sourceToken: "src-tok",
      sourceUrl: "https://nb1.acme.example/api",
      destToken: "dest-tok",
      destUrl: "https://nb2.acme.example/api",
      resources,
      selection: emptySelection(),
      conflicts: [],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const events = await readSSEEvents(res.body);
    expect(events[events.length - 1].type).toBe("complete");
  });
});
