import { NextRequest } from "next/server";
import { NetBirdClient } from "@/lib/netbird-client";
import { MigrationEngine } from "@/lib/migration-engine";
import type {
  SourceResources,
  ResourceSelection,
  Conflict,
  MigrationEvent,
} from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sourceToken,
      sourceUrl,
      destToken,
      destUrl,
      resources,
      selection,
      conflicts,
    } = body as {
      sourceToken: string;
      sourceUrl: string;
      destToken: string;
      destUrl: string;
      resources: SourceResources;
      selection: ResourceSelection;
      conflicts: Conflict[];
    };

    if (!sourceToken || !sourceUrl || !destToken || !destUrl) {
      return new Response(
        JSON.stringify({ error: "All connection details are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const source = new NetBirdClient(sourceToken, sourceUrl);
        const dest = new NetBirdClient(destToken, destUrl);

        const emit = (event: MigrationEvent) => {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        const engine = new MigrationEngine(source, dest, emit);

        try {
          await engine.execute(resources, selection, conflicts);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          emit({
            type: "error",
            message: `Migration failed: ${message}`,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Migration failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
