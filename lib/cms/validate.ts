import { NextResponse } from "next/server";
import type { z } from "zod";

/** Parses a JSON body with a zod schema: the data, or a 400 answer listing what is wrong. */
export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | NextResponse> {
  const raw = await request.json().catch(() => undefined);
  const r = schema.safeParse(raw);
  if (!r.success) {
    const msg = r.error.issues.slice(0, 5).map((i) => (i.path.length ? i.path.join(".") + ": " : "") + i.message).join("; ");
    return NextResponse.json({ error: "Проверьте данные: " + msg }, { status: 400 });
  }
  return r.data;
}
