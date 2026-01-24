const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./,
];

const PRIVATE_HOSTNAMES = ["localhost", "[::1]"];

export function validateUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "https:") {
    const isDev = process.env.NODE_ENV === "development";
    const isLocalhost =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (!(isDev && isLocalhost && parsed.protocol === "http:")) {
      return { valid: false, error: "URL must use HTTPS" };
    }
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  if (PRIVATE_HOSTNAMES.includes(parsed.hostname)) {
    if (process.env.NODE_ENV !== "development") {
      return { valid: false, error: "Private/local URLs are not allowed" };
    }
  }

  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(hostname)) {
      return { valid: false, error: "Private/internal IP addresses are not allowed" };
    }
  }

  if (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd")) {
    return { valid: false, error: "Private IPv6 addresses are not allowed" };
  }

  if (parsed.hostname.endsWith(".internal") || parsed.hostname.endsWith(".local")) {
    return { valid: false, error: "Internal hostnames are not allowed" };
  }

  return { valid: true };
}
