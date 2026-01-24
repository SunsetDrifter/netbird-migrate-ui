import { NextRequest, NextResponse } from "next/server";
import { NetBirdClient } from "@/lib/netbird-client";

export async function POST(req: NextRequest) {
  try {
    const { token, url } = await req.json();

    if (!token || !url) {
      return NextResponse.json(
        { error: "Token and URL are required" },
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
