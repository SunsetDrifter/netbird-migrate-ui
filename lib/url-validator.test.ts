import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateUrl } from "./url-validator";

describe("validateUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a normal HTTPS public URL", () => {
    expect(validateUrl("https://api.netbird.io/api")).toEqual({ valid: true });
  });

  it("rejects malformed URLs", () => {
    expect(validateUrl("not a url").valid).toBe(false);
    expect(validateUrl("").valid).toBe(false);
  });

  it("rejects HTTP URLs in production", () => {
    expect(validateUrl("http://api.netbird.io/api").valid).toBe(false);
  });

  it("accepts http://localhost only in development", () => {
    expect(validateUrl("http://localhost:8080").valid).toBe(false);

    vi.stubEnv("NODE_ENV", "development");
    expect(validateUrl("http://localhost:8080").valid).toBe(true);
  });

  it("rejects private IPv4 ranges", () => {
    expect(validateUrl("https://10.0.0.1").valid).toBe(false);
    expect(validateUrl("https://192.168.1.1").valid).toBe(false);
    expect(validateUrl("https://172.16.0.1").valid).toBe(false);
    expect(validateUrl("https://127.0.0.1").valid).toBe(false);
    expect(validateUrl("https://169.254.169.254").valid).toBe(false);
  });

  it("rejects .internal and .local hostnames", () => {
    expect(validateUrl("https://api.internal").valid).toBe(false);
    expect(validateUrl("https://printer.local").valid).toBe(false);
  });

  it("rejects private IPv6 ranges", () => {
    expect(validateUrl("https://[::1]").valid).toBe(false);
    expect(validateUrl("https://[fc00::1]").valid).toBe(false);
    expect(validateUrl("https://[fd12::1]").valid).toBe(false);
  });

  it("rejects 100.64.0.0/10 carrier-grade NAT range", () => {
    expect(validateUrl("https://100.64.0.1").valid).toBe(false);
    expect(validateUrl("https://100.127.255.255").valid).toBe(false);
  });
});
