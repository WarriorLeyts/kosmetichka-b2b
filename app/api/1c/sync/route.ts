import { NextRequest, NextResponse } from "next/server";
import { syncKeyOk } from "@/lib/syncKey";
import { runSync } from "@/lib/syncRunner";

function checkApiKey(request: NextRequest) {
  const key = request.headers.get("x-1c-key");
  return syncKeyOk(key);
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Run in background — don't wait
  runSync("1C sync");

  return NextResponse.json({ ok: true, message: "Sync started" });
}
