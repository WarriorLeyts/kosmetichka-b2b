import { NextResponse } from "next/server";

/**
 * Выход сотрудника любой роли (admin, manager, picker, hr, employee).
 * Cookie стираем с теми же атрибутами, с которыми его ставит /api/admin/login,
 * чтобы браузер точно заменил его, а не оставил рядом.
 */
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set("admin_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
