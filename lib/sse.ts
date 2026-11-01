import { onLive, type LiveEvent } from "@/lib/realtime";

/**
 * Server-Sent Events stream of live hints for one viewer. `pick` decides which events this viewer gets
 * (and what is sent). Pings every 20 s keep proxies from closing it; the client reconnects anyway.
 */
const PAD = ":" + " ".repeat(2048) + "\n\n"; // Safari / iOS start delivering a stream after ~1 KB
const encoder = new TextEncoder();

/** open streams per viewer (`key`) */
const open = new Map<string, number>();

export function liveStream(
  request: Request,
  pick: (e: LiveEvent) => Record<string, unknown> | null,
  limit?: { key: string; max: number }
): Response {
  // one customer can't keep dozens of connections open (each holds server memory). The extra one
  // gets 429: its client backs off and retries later (closing the oldest instead made the tabs
  // knock each other out every 2 s); a screen without the stream still refreshes by its timer.
  if (limit && (open.get(limit.key) ?? 0) >= limit.max) {
    return new Response("too many live connections", { status: 429, headers: { "Retry-After": "60" } });
  }
  if (limit) open.set(limit.key, (open.get(limit.key) ?? 0) + 1);
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          close();
        }
      };
      send(PAD + "retry: 2000\n\n" + "data: {\"t\":\"hello\"}\n\n");
      const off = onLive((e) => {
        const out = pick(e);
        // each event padded too: a small chunk can sit in a mobile browser's buffer
        if (out) send(`data: ${JSON.stringify(out)}\n\n` + PAD);
      });
      const ping = setInterval(() => send(": ping\n\n"), 20_000);
      // a stream lives at most 10 min; the client reconnects (fresh auth, no forgotten sockets)
      const max = setTimeout(() => close(), 10 * 60_000);
      let closed = false;
      close = () => {
        if (closed) return;
        closed = true;
        off();
        clearInterval(ping);
        clearTimeout(max);
        if (limit) {
          const n = (open.get(limit.key) ?? 1) - 1;
          if (n > 0) open.set(limit.key, n);
          else open.delete(limit.key);
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", () => close());
    },
    cancel() {
      close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
