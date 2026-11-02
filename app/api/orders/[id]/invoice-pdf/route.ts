import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyCustomerToken } from "@/lib/customerAuth";
import { verifyInvoiceLink } from "@/lib/auth";
import { getStaffSession } from "../../../team/_auth";
import { loadInvoice } from "@/lib/invoice";
import { invoicePdf } from "@/lib/invoicePdf";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/:id/invoice-pdf — the invoice as a PDF. Who may open it: a 7-day invoice link
 * (?t=…, made by /api/orders/:id/invoice-link or /api/team/orders/:id/invoice-link — what is shared),
 * a signed-in admin / manager, or the order's customer. ?download=1 — save instead of showing.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const notFound = () => NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
  if (!Number.isInteger(id) || id <= 0) return notFound();
  const url = new URL(request.url);

  let audience: "staff" | "customer" | null = null;
  let mustBeCustomer: number | null = null;
  const t = url.searchParams.get("t");
  const link = t ? await verifyInvoiceLink(t, id) : null;
  if (link) {
    audience = link.aud;
    mustBeCustomer = link.customerId;
  } else {
    const staff = await getStaffSession();
    if (staff && (staff.role === "admin" || staff.role === "manager")) audience = "staff";
    else {
      const ct = (await cookies()).get("auth_token")?.value;
      const c = ct ? await verifyCustomerToken(ct) : null;
      if (c?.id) {
        audience = "customer";
        mustBeCustomer = Number(c.id);
      }
    }
  }
  if (!audience) return NextResponse.json({ error: t ? "Ссылка на счёт устарела — попросите новую" : "Не авторизован" }, { status: t ? 403 : 401 });

  const inv = await loadInvoice(id, audience);
  // a customer (or a link made for him) opens only his own order
  if (!inv || (mustBeCustomer !== null && inv.customerId !== mustBeCustomer)) return notFound();

  const pdf = await invoicePdf(inv);
  const how = url.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${how}; filename="schet-${id}.pdf"; filename*=UTF-8''${encodeURIComponent(`Счёт №${id}.pdf`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
