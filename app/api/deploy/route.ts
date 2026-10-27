import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { createHmac, timingSafeEqual } from "crypto";

async function verifyGithubSignature(request: NextRequest, body: string) {
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) return false;

  // Без секрета HMAC с пустым ключом мог бы подписать кто угодно
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) return false;
  const expected = Buffer.from("sha256=" + createHmac("sha256", secret).update(body).digest("hex"));
  const got = Buffer.from(signature);
  return got.length === expected.length && timingSafeEqual(got, expected);
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
