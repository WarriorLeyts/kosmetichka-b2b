import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ALLOWED_FILES = ["import.xml", "offers.xml", "customers.xml"];

function checkApiKey(request: NextRequest) {
  const key = request.headers.get("x-1c-key");
  return key === process.env.SYNC_API_KEY;
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filename = request.nextUrl.searchParams.get("file");

  if (!filename || !ALLOWED_FILES.includes(filename)) {
    return NextResponse.json(
      { error: "Invalid file. Allowed: import.xml, offers.xml, customers.xml" },
      { status: 400 }
    );
  }

  const body = await request.text();

  if (!body) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "data", "1c");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), body, "utf8");

  return NextResponse.json({ ok: true, file: filename, bytes: body.length });
}
