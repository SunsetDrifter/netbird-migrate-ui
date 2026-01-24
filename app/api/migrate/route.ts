import { NextRequest } from "next/server";
import { NetBirdClient } from "@/lib/netbird-client";
import { MigrationEngine } from "@/lib/migration-engine";
import { validateUrl } from "@/lib/url-validator";
import { checkRateLimit } from "@/lib/rate-limiter";
import type {
  SourceResources,
  ResourceSelection,
  Conflict,
  MigrationEvent,
} from "@/lib/types";

const SSE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest) {
  const rateLimited = checkRateLimit(req, 5);
  if (rateLimited) return rateLimited;

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

    if (!destToken || typeof destToken !== "string" || destToken.length > 500) {
      return new Response(
        JSON.stringify({ error: "Invalid destination token" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!destUrl || typeof destUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid destination URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const hasSourceCredentials = sourceToken && sourceUrl;

    if (hasSourceCredentials) {
      if (typeof sourceToken !== "string" || sourceToken.length > 500) {
        return new Response(
          JSON.stringify({ error: "Invalid source token" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      const sourceUrlCheck = validateUrl(sourceUrl);
      if (!sourceUrlCheck.valid) {
        return new Response(
          JSON.stringify({ error: `Source URL: ${sourceUrlCheck.error}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    } else if (!resources || typeof resources !== "object" || !Array.isArray(resources.groups)) {
      return new Response(
        JSON.stringify({ error: "Source credentials or pre-fetched resources required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const destUrlCheck = validateUrl(destUrl);
    if (!destUrlCheck.valid) {
      return new Response(
        JSON.stringify({ error: `Destination URL: ${destUrlCheck.error}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!resources || typeof resources !== "object") {
      return new Response(
        JSON.stringify({ error: "Invalid resources" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!selection || typeof selection !== "object") {
      return new Response(
        JSON.stringify({ error: "Invalid selection" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(conflicts)) {
      return new Response(
        JSON.stringify({ error: "Invalid conflicts" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), SSE_TIMEOUT_MS);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const source = hasSourceCredentials
          ? new NetBirdClient(sourceToken, sourceUrl)
          : new NetBirdClient("", "");
        const dest = new NetBirdClient(destToken, destUrl);

        const emit = (event: MigrationEvent) => {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        const engine = new MigrationEngine(source, dest, emit);

        abortController.signal.addEventListener("abort", () => {
          emit({
            type: "error",
            message: "Migration timed out after 10 minutes",
          });
          controller.close();
        });

        try {
          await engine.execute(resources, selection, conflicts);
        } catch (err) {
          if (abortController.signal.aborted) return;
          const message = err instanceof Error ? err.message : String(err);
          emit({
            type: "error",
            message: `Migration failed: ${message}`,
          });
        } finally {
          clearTimeout(timeout);
          if (!abortController.signal.aborted) {
            controller.close();
          }
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
