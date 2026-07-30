import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

function mimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: filePath } = await params;

  const baseDir = path.join(process.cwd(), "data", "1c");
  const resolvedPath = path.normalize(
    path.join(baseDir, ...filePath)
  );

  // Prevent path traversal (e.g. "../../.env")
  if (
    resolvedPath !== baseDir &&
    !resolvedPath.startsWith(baseDir + path.sep)
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedPath);
  } catch {
    return new Response("File not found", { status: 404 });
  }

  if (!stat.isFile()) {
    return new Response("File not found", { status: 404 });
  }

  // Return 304 if the client already has a fresh copy
  const lastModified = stat.mtime.toUTCString();
  const ifModifiedSince = request.headers.get("if-modified-since");
  if (ifModifiedSince && new Date(ifModifiedSince) >= stat.mtime) {
    return new Response(null, { status: 304 });
  }

  // Stream file instead of blocking readFileSync
  const stream = fs.createReadStream(resolvedPath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) =>
        controller.enqueue(
          chunk instanceof Buffer ? chunk : Buffer.from(chunk)
        )
      );
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new Response(webStream, {
    headers: {
      "Content-Type": mimeType(resolvedPath),
      "Content-Length": String(stat.size),
      "Last-Modified": lastModified,
      // Product images from 1C don't change path once uploaded — cache aggressively
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
