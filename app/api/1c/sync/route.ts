import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

function checkApiKey(request: NextRequest) {
  const key = request.headers.get("x-1c-key");
  return key === process.env.SYNC_API_KEY;
}

export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "sync-all.js");

  // Run in background — don't wait
  exec(`node ${scriptPath}`, { cwd: process.cwd() }, (err, stdout, stderr) => {
    if (err) {
      console.error("[1C sync] error:", err.message);
      console.error(stderr);
    } else {
      console.log("[1C sync] done:", stdout);
    }
  });

  return NextResponse.json({ ok: true, message: "Sync started" });
}
