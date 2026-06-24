import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
request: NextRequest,
{ params }: { params: Promise<{ path: string[] }> }
) {
const { path: filePath } = await params;

const baseDir = path.join(process.cwd(), "data", "1c");
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

if (!fs.existsSync(resolvedPath)) {
return new Response("File not found", { status: 404 });
}

const file = fs.readFileSync(resolvedPath);

return new Response(file, {
headers: {
"Content-Type": "image/jpeg",
"Cache-Control": "public, max-age=86400",
},
});
}