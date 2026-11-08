import { NextRequest, NextResponse } from "next/server";
import { ANY_STAFF, requireStaff } from "../_auth";
import { warehouseStockByProductId } from "@/lib/warehouseStock";

/**
 * GET /api/team/warehouse-stock?ids=1,2,3 → { stock: { "1": [{ name, qty }], … } }
 * Stock per 1С warehouse for product lists in Team (catalog, adding to an order). Staff only: the
 * catalog itself comes from the customer API, which never has the split.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaff(ANY_STAFF);
  if (!auth.ok) return auth.response;
  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 300);
  const map = await warehouseStockByProductId(ids);
  return NextResponse.json({ stock: Object.fromEntries(map) }, { headers: { "Cache-Control": "no-store" } });
}
