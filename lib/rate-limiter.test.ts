import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limiter";
import { NextRequest } from "next/server";

function makeReq(path: string, ip = "1.2.3.4"): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const path = "/api/under-limit";
    for (let i = 0; i < 5; i++) {
      const res = checkRateLimit(makeReq(path, "10.0.0.1"), 5);
      expect(res).toBeNull();
    }
  });

  it("returns 429 when the limit is exceeded", () => {
    const path = "/api/over-limit";
    let lastRes = null;
    for (let i = 0; i < 5; i++) {
      lastRes = checkRateLimit(makeReq(path, "10.0.0.2"), 3);
    }
    expect(lastRes).not.toBeNull();
    expect(lastRes?.status).toBe(429);
  });

  it("tracks limits per (ip, path) tuple independently", () => {
    const ip = "10.0.0.3";
    expect(checkRateLimit(makeReq("/api/a", ip), 1)).toBeNull();
    expect(checkRateLimit(makeReq("/api/a", ip), 1)?.status).toBe(429);

    // Different path should not be rate-limited.
    expect(checkRateLimit(makeReq("/api/b", ip), 1)).toBeNull();
  });
});
