export type NetBirdPlatform = "cloud" | "self-hosted" | "unknown";

const CLOUD_HOST_SUFFIXES = [".netbird.io", ".netbird.cloud"];
const CLOUD_HOSTS = new Set(["api.netbird.io", "api.netbird.cloud"]);

export function detectPlatform(url: string | null | undefined): NetBirdPlatform {
  if (!url) return "unknown";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (CLOUD_HOSTS.has(host)) return "cloud";
    if (CLOUD_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
      return "cloud";
    }
    return "self-hosted";
  } catch {
    return "unknown";
  }
}

export function isCrossPlatformMigration(
  sourceUrl: string | null | undefined,
  destUrl: string | null | undefined
): boolean {
  const a = detectPlatform(sourceUrl);
  const b = detectPlatform(destUrl);
  if (a === "unknown" || b === "unknown") return false;
  return a !== b;
}
