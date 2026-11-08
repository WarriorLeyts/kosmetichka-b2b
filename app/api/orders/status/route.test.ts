import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ order: { findMany: vi.fn() }, customer: { findUnique: vi.fn(async () => ({ isApproved: true })) } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "t" }) }) }));
vi.mock("@/lib/customerAuth", () => ({ verifyCustomerToken: async () => ({ id: 7 }) }));

import { GET } from "./route";

describe("order status: manager messages read on another device", () => {
  it("a chat seen up to the newest manager message is not new", async () => {
    const at = new Date("2026-11-08T10:00:00Z");
    db.order.findMany.mockResolvedValue([
      { id: 1, status: "pending", confirmRequestedAt: null, customerConfirmed: false, customerChatSeenAt: at, messages: [{ createdAt: at, text: "ok" }] },
      { id: 2, status: "pending", confirmRequestedAt: null, customerConfirmed: false, customerChatSeenAt: at, messages: [{ createdAt: new Date("2026-11-08T11:00:00Z"), text: "новое" }] },
      { id: 3, status: "pending", confirmRequestedAt: null, customerConfirmed: false, customerChatSeenAt: null, messages: [{ createdAt: at, text: "не читал" }] },
    ]);
    const body = await (await GET()).json();
    expect(body.managerMessages.map((m: { orderId: number }) => m.orderId)).toEqual([2, 3]);
  });
});
