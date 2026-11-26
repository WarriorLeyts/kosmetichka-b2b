import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { currentCustomerId } from "../../../mobile/_auth";
import { getStaffSession } from "../../../team/_auth";
import { demandPhotoOwned, demandPhotoPath } from "../storage";
export async function GET(_r: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!demandPhotoOwned(name)) return new NextResponse(null, { status: 404 });
  const customerId = await currentCustomerId();
  if (!customerId || !demandPhotoOwned(name, customerId)) {
    if ((await getStaffSession())?.role !== "admin") return new NextResponse(null, { status: 404 });
  }
  try { return new NextResponse(new Uint8Array(await readFile(demandPhotoPath(name))), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } }); }
  catch { return new NextResponse(null, { status: 404 }); }
}
