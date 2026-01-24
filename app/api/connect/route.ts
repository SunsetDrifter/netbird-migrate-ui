import { NextRequest, NextResponse } from "next/server";
import { NetBirdClient } from "@/lib/netbird-client";
import { validateUrl } from "@/lib/url-validator";
import { checkRateLimit } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  const rateLimited = checkRateLimit(req, 20);
  if (rateLimited) return rateLimited;

  try {
    const { token, url } = await req.json();

    if (!token || typeof token !== "string" || token.length > 500) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 400 }
      );
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Invalid URL" },
        { status: 400 }
      );
    }

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
