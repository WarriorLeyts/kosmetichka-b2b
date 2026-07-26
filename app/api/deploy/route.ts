import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { createHmac } from "crypto";

async function verifyGithubSignature(request: NextRequest, body: string) {
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) return false;

  const secret = process.env.DEPLOY_SECRET ?? "";
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  return signature === expected;
}

export async function POST(request: NextRequest) {
  const body = await request.text();

  const valid = await verifyGithubSignature(request, body);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scriptPath = `${process.env.HOME ?? "/root"}/deploy.sh`;

  exec(`bash ${scriptPath}`, (err, stdout, stderr) => {
    if (err) {
      console.error("[deploy] error:", err.message, stderr);
    } else {
      console.log("[deploy] success:", stdout);
    }
  });

  return NextResponse.json({ ok: true, message: "Deploy started" });
}
