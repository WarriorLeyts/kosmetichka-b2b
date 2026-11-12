import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { CmsUser } from "./auth";

/** Journal of staff actions in the admin panel (who / what / before / after). Never throws. */
export async function logAction(
  user: CmsUser,
  ip: string | null,
  e: { action: string; entity: string; entityId?: string | number | null; summary: string; before?: unknown; after?: unknown }
) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        userId: user.id,
        userName: user.name || user.login,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId == null ? null : String(e.entityId),
        summary: e.summary.slice(0, 500),
        before: e.before === undefined ? undefined : (JSON.parse(JSON.stringify(e.before)) as Prisma.InputJsonValue),
        after: e.after === undefined ? undefined : (JSON.parse(JSON.stringify(e.after)) as Prisma.InputJsonValue),
        ip,
      },
    });
  } catch (err) {
    console.error("[cms] audit log failed", err);
  }
}
