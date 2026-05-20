import { describe, expect, it } from "vitest";
import {
  ConnectRequestSchema,
  MigrateRequestSchema,
  ResourcesRequestSchema,
  formatZodError,
} from "./schemas";
import { makeFullSourceResources } from "@/tests/fixtures/netbird";

describe("ConnectRequestSchema", () => {
  it("accepts a valid token and URL", () => {
    const r = ConnectRequestSchema.safeParse({
      token: "tok_abc",
      url: "https://api.netbird.io/api",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty token", () => {
    const r = ConnectRequestSchema.safeParse({
      token: "",
      url: "https://api.netbird.io/api",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed URL", () => {
    const r = ConnectRequestSchema.safeParse({
      token: "tok_abc",
      url: "not-a-url",
    });
    expect(r.success).toBe(false);
  });

  it("rejects oversize token", () => {
    const r = ConnectRequestSchema.safeParse({
      token: "x".repeat(501),
      url: "https://api.netbird.io/api",
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing token entirely", () => {
    const r = ConnectRequestSchema.safeParse({
      url: "https://api.netbird.io/api",
    });
    expect(r.success).toBe(false);
  });
});

describe("ResourcesRequestSchema", () => {
  it("accepts the same shape as connect", () => {
    const r = ResourcesRequestSchema.safeParse({
      token: "tok_abc",
      url: "https://api.netbird.io/api",
    });
    expect(r.success).toBe(true);
  });
});

describe("MigrateRequestSchema", () => {
  const validBase = (): Record<string, unknown> => ({
    sourceToken: "src-tok",
    sourceUrl: "https://src.netbird.io/api",
    destToken: "dest-tok",
    destUrl: "https://dest.netbird.io/api",
    resources: makeFullSourceResources(),
    selection: {
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
    },
    conflicts: [],
  });

  it("accepts a full valid payload", () => {
    const r = MigrateRequestSchema.safeParse(validBase());
    expect(r.success).toBe(true);
  });

  it("accepts an import-only payload (no source credentials, but resources provided)", () => {
    const payload = validBase();
    payload.sourceToken = "";
    payload.sourceUrl = "";
    const r = MigrateRequestSchema.safeParse(payload);
    expect(r.success).toBe(true);
  });

  it("rejects when destination URL is missing", () => {
    const payload = validBase();
    delete payload.destUrl;
    const r = MigrateRequestSchema.safeParse(payload);
    expect(r.success).toBe(false);
  });

  it("rejects when resources are not an object", () => {
    const payload = validBase();
    payload.resources = "nope";
    const r = MigrateRequestSchema.safeParse(payload);
    expect(r.success).toBe(false);
  });

  it("rejects an unknown conflict resourceType", () => {
    const payload = validBase();
    payload.conflicts = [
      {
        resourceType: "made_up",
        sourceId: "x",
        sourceName: "x",
        destinationId: "y",
        resolution: "skip",
      },
    ];
    const r = MigrateRequestSchema.safeParse(payload);
    expect(r.success).toBe(false);
  });
});

describe("formatZodError", () => {
  it("includes the field path in the message", () => {
    const r = ConnectRequestSchema.safeParse({ token: "", url: "" });
    if (r.success) throw new Error("expected failure");
    const msg = formatZodError(r.error);
    expect(msg).toContain("token");
    expect(msg).toContain("url");
  });
});
