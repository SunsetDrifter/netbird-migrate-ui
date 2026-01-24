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
    const resources = await client.getAllResources();

    return NextResponse.json(resources);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch resources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
