import { NextRequest } from "next/server";
import { NetBirdClient } from "@/lib/netbird-client";
import { MigrationEngine } from "@/lib/migration-engine";
import { validateUrl } from "@/lib/url-validator";
import { checkRateLimit } from "@/lib/rate-limiter";
import { MigrateRequestSchema, formatZodError } from "@/lib/schemas";
import type { MigrationEvent } from "@/lib/types";

const SSE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const rateLimited = checkRateLimit(req, 5);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json().catch(() => null);
    const parsed = MigrateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, formatZodError(parsed.error));
    }
    const {
      sourceToken,
      sourceUrl,
      destToken,
      destUrl,
      resources,
      selection,
      conflicts,
    } = parsed.data;

    const hasSourceCredentials = !!(sourceToken && sourceUrl);

    if (hasSourceCredentials && sourceUrl) {
      const sourceUrlCheck = validateUrl(sourceUrl);
      if (!sourceUrlCheck.valid) {
        return jsonError(400, `Source URL: ${sourceUrlCheck.error}`);
      }
    }

    const destUrlCheck = validateUrl(destUrl);
    if (!destUrlCheck.valid) {
      return jsonError(400, `Destination URL: ${destUrlCheck.error}`);
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), SSE_TIMEOUT_MS);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const source =
          hasSourceCredentials && sourceToken && sourceUrl
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
