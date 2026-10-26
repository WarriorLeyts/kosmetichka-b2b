import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { pickWidth, thumbResponse } from "@/lib/thumb";
import { DATA_ROOT } from "@/lib/dataDir";

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

const baseDir = path.join(DATA_ROOT, "1c");
const resolvedPath = path.normalize(
path.join(baseDir, ...filePath)
);

// Reject anything that escapes data/1c (e.g. "../../.env") before
// touching the filesystem.
if (
resolvedPath !== baseDir &&
!resolvedPath.startsWith(baseDir + path.sep)
) {
return new Response("Forbidden", { status: 403 });
}

// Only photos: data/1c also holds the 1C exchange files (customers.xml, orders-*.xml,

// import.xml) with customers' personal data — they must never be downloadable.

if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(path.extname(resolvedPath).toLowerCase())) {

  return new Response("File not found", { status: 404 });

}


if (!fs.existsSync(resolvedPath)) {
return new Response("File not found", { status: 404 });
}

// ?w=320 — уменьшенная копия (WebP) для карточек, корзины и т.п.
const thumbWidth = pickWidth(request.nextUrl.searchParams.get("w"));
if (thumbWidth) {
  const thumb = await thumbResponse(baseDir, resolvedPath, thumbWidth);
  if (thumb) return thumb;
}

const file = fs.readFileSync(resolvedPath);

return new Response(file, {
headers: {
"Content-Type": mimeType(resolvedPath),
"Cache-Control": "public, max-age=2592000, immutable",
},
});
}