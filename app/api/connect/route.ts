import { NextRequest, NextResponse } from "next/server";
import { NetBirdClient } from "@/lib/netbird-client";
import { validateUrl } from "@/lib/url-validator";
import { checkRateLimit } from "@/lib/rate-limiter";
import { ConnectRequestSchema, formatZodError } from "@/lib/schemas";

export async function POST(req: NextRequest) {
  const rateLimited = checkRateLimit(req, 20);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json().catch(() => null);
    const parsed = ConnectRequestSchema.safeParse(body);
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
    await client.testConnection();

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
