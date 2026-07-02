import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Bitrix24 calls this endpoint when a timeline comment is added to any deal.
// Setup (one time): POST {BITRIX_WEBHOOK_URL}event.bind.json
//   { "event": "ONCRMTIMELINECOMMENTADD", "handler": "https://kosmetichka-opt.ru/api/bitrix/comment" }
//
// Bitrix sends a form-encoded POST with PHP-style bracket keys:
//   event=ONCRMTIMELINECOMMENTADD
//   data[FIELDS][ID]=165752
//   data[FIELDS][ENTITY_ID]=22653
//   data[FIELDS][ENTITY_TYPE_ID]=2
//   data[FIELDS][COMMENT]=Manager reply text
//   data[FIELDS][AUTHOR_ID]=1

const CUSTOMER_MARKER = "[🛒 Сообщение покупателя]";

async function bitrixPost(webhookUrl: string, method: string, body: object): Promise<any> {
  const res = await fetch(`${webhookUrl}${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Parse PHP-style bracket notation: data[FIELDS][ID] → { data: { FIELDS: { ID: "..." } } } */
function parseBracketParams(params: URLSearchParams): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [rawKey, value] of params.entries()) {
    // Split "data[FIELDS][ID]" into ["data", "FIELDS", "ID"]
    const keys = rawKey.split(/[\[\]]+/).filter(Boolean);
    let cursor: Record<string, any> = result;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof cursor[keys[i]] !== "object" || cursor[keys[i]] === null) {
        cursor[keys[i]] = {};
      }
      cursor = cursor[keys[i]];
    }
    cursor[keys[keys.length - 1]] = value;
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const parsed = parseBracketParams(params);

    const event: string = parsed.event || params.get("event") || "";
    console.log(`[Comment webhook] event=${event}`);

    if (event !== "ONCRMTIMELINECOMMENTADD") {
      return NextResponse.json({ ok: true, skip: "not comment event" });
    }

    const fields: Record<string, string> = parsed.data?.FIELDS || {};
    const commentId = String(fields.ID || "");
    const entityId = Number(fields.ENTITY_ID) || null;   // Bitrix deal ID
    const entityTypeId = Number(fields.ENTITY_TYPE_ID) || 0;
    let commentText = String(fields.COMMENT || "").trim();

    console.log(`[Comment webhook] commentId=${commentId} entityId=${entityId} typeId=${entityTypeId} textLen=${commentText.length}`);

    // Only process deal (entityTypeId=2) comments
    if (entityTypeId !== 2) {
      return NextResponse.json({ ok: true, skip: "not a deal" });
    }
    if (!entityId) {
      return NextResponse.json({ ok: true, skip: "no entity_id" });
    }

    // If Bitrix didn't include the text in the event, try fetching it by ID
    if (!commentText && commentId) {
      const webhookUrl = process.env.BITRIX_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          const r = await bitrixPost(webhookUrl, "crm.timeline.comment.get", { id: commentId });
          commentText = String(r.result?.COMMENT || "").trim();
          console.log(`[Comment webhook] fetched comment text len=${commentText.length}`);
        } catch {
          console.error("[Comment webhook] crm.timeline.comment.get failed");
        }
      }
    }

    if (!commentText) {
      return NextResponse.json({ ok: true, skip: "no text" });
    }

    // Skip messages we ourselves posted (customer messages)
    if (commentText.startsWith(CUSTOMER_MARKER) || commentText.startsWith("[🛒")) {
      return NextResponse.json({ ok: true, skip: "own customer message" });
    }

    // Find the order linked to this Bitrix deal
    const order = await prisma.order.findFirst({
      where: { bitrixDealId: entityId },
    });

    if (!order) {
      console.log(`[Comment webhook] No order found for dealId=${entityId}`);
      return NextResponse.json({ ok: true, skip: "no matching order" });
    }

    // Save manager message (UNIQUE on bitrixCommentId prevents duplicates)
    try {
      await prisma.orderMessage.create({
        data: {
          orderId: order.id,
          text: commentText,
          isFromManager: true,
          bitrixCommentId: commentId || null,
        },
      });
      console.log(`[Comment webhook] ✓ Saved manager message order=${order.id} comment=${commentId}`);
    } catch {
      // Unique constraint violation — already saved, skip silently
      console.log(`[Comment webhook] Duplicate comment ${commentId}, skipped`);
    }

    // Always respond 200 to Bitrix (otherwise it retries)
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Comment webhook] Unhandled error:", err);
    return NextResponse.json({ ok: true }); // Still 200 — Bitrix must not retry endlessly
  }
}
