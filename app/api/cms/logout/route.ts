import { NextResponse } from "next/server";

// POST /api/cms/logout — выход из админ-панели (форма в меню или fetch)
export async function POST(request: Request) {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json") || request.headers.get("content-type")?.includes("json");
  const res = wantsJson ? NextResponse.json({ ok: true }) : new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  res.cookies.set("admin_token", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
