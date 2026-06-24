import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-deploy-secret");

  if (!secret || secret !== process.env.DEPLOY_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cwd = process.cwd();

  const cmd = [
    "git pull origin main",
    "npm install --production=false",
    "npx prisma generate",
    "npm run build",
    "pm2 restart kosmetichka",
  ].join(" && ");

  exec(cmd, { cwd }, (err, stdout, stderr) => {
    if (err) {
      console.error("[deploy] error:", err.message, stderr);
    } else {
      console.log("[deploy] success:", stdout);
    }
  });

  return NextResponse.json({ ok: true, message: "Deploy started" });
}
