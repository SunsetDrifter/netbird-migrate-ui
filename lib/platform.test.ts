import { describe, expect, it } from "vitest";
import { detectPlatform, isCrossPlatformMigration } from "./platform";

describe("detectPlatform", () => {
  it("identifies api.netbird.io as cloud", () => {
    expect(detectPlatform("https://api.netbird.io/api")).toBe("cloud");
  });

  it("identifies api.netbird.cloud as cloud", () => {
    expect(detectPlatform("https://api.netbird.cloud/api")).toBe("cloud");
  });

  it("identifies any *.netbird.io subdomain as cloud", () => {
    expect(detectPlatform("https://eu1.netbird.io/api")).toBe("cloud");
  });

  it("identifies anything else as self-hosted", () => {
    expect(detectPlatform("https://community.meshmap.ai/api")).toBe(
      "self-hosted"
    );
    expect(detectPlatform("https://netbird.acme.corp/api")).toBe("self-hosted");
  });

  it("returns 'unknown' for malformed or empty URLs", () => {
    expect(detectPlatform("")).toBe("unknown");
    expect(detectPlatform(null)).toBe("unknown");
    expect(detectPlatform("not a url")).toBe("unknown");
  });

  it("is case-insensitive on hostname", () => {
    expect(detectPlatform("https://API.NETBIRD.IO/api")).toBe("cloud");
  });
});

describe("isCrossPlatformMigration", () => {
  it("flags self-hosted → cloud as cross-platform", () => {
    expect(
      isCrossPlatformMigration(
        "https://community.meshmap.ai/api",
        "https://api.netbird.io/api"
      )
    ).toBe(true);
  });

  it("flags cloud → self-hosted as cross-platform", () => {
    expect(
      isCrossPlatformMigration(
        "https://api.netbird.io/api",
        "https://nb.acme.corp/api"
      )
    ).toBe(true);
  });

  it("returns false for cloud → cloud", () => {
    expect(
      isCrossPlatformMigration(
        "https://api.netbird.io/api",
        "https://api.netbird.cloud/api"
      )
    ).toBe(false);
  });

  it("returns false for self-hosted → self-hosted", () => {
    expect(
      isCrossPlatformMigration(
        "https://nb1.acme.corp/api",
        "https://nb2.acme.corp/api"
      )
    ).toBe(false);
  });

  it("returns false when either side is unknown (don't block by guess)", () => {
    expect(
      isCrossPlatformMigration(null, "https://api.netbird.io/api")
    ).toBe(false);
    expect(
      isCrossPlatformMigration("https://api.netbird.io/api", null)
    ).toBe(false);
  });
});
