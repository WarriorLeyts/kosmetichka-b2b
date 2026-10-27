import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { CHAT_DIR, typeForExt } from "../storage";

/**
 * Serves a chat attachment. Supports HTTP Range requests — iPhone video playback needs them.
 * File names are random (chat-<time>-<random>.<ext>), only our own allowed types are served.
 */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^chat-[0-9]+-[a-z0-9]+\.[a-z0-9]+$/.test(name)) return new NextResponse("Not found", { status: 404 });
  const t = typeForExt(name.split(".").pop() || "");
  if (!t) return new NextResponse("Not found", { status: 404 });

  const file = path.join(CHAT_DIR, name);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": t.mime,
    "Accept-Ranges": "bytes",
    // customers' photos / documents: browser cache only, never shared proxies
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    // photos and videos open in place; documents download
    "Content-Disposition": t.kind === "file" ? "attachment" : "inline",
  };

  const range = request.headers.get("range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new NextResponse(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
