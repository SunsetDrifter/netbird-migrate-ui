import { NextRequest, NextResponse } from "next/server";
import { NetBirdClient } from "@/lib/netbird-client";
import { validateUrl } from "@/lib/url-validator";
import { checkRateLimit } from "@/lib/rate-limiter";
import { ResourcesRequestSchema, formatZodError } from "@/lib/schemas";

export async function POST(req: NextRequest) {
  const rateLimited = checkRateLimit(req, 10);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json().catch(() => null);
    const parsed = ResourcesRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400 }
      );
    }
    const { token, url } = parsed.data;

    const urlCheck = validateUrl(url);
    if (!urlCheck.valid) {
      return NextResponse.json(
        { error: urlCheck.error },
        { status: 400 }
      );
    }

    const client = new NetBirdClient(token, url);
    const resources = await client.getAllResources();

    return NextResponse.json(resources);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch resources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
