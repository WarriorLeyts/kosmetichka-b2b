/** Confirming a registration sends the customer one SMS — not again when already confirmed. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => true), requireAdminRole: vi.fn(async () => true) }));
const db = vi.hoisted(() => ({ customer: { findUnique: vi.fn(), update: vi.fn(async () => ({})) } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const sms = vi.hoisted(() => ({ smsCustomer: vi.fn(async () => true), SMS_TEXT: { registrationApproved: "ok" } }));
vi.mock("@/lib/sms", () => sms);

import { POST } from "./route";

const call = () => POST(new Request("https://x", { method: "POST" }), { params: Promise.resolve({ id: "5" }) });

beforeEach(() => vi.clearAllMocks());

describe("approve", () => {
  it("SMS when confirmed now", async () => {
    db.customer.findUnique.mockResolvedValue({ isApproved: false });
    expect((await call()).status).toBe(200);
    expect(sms.smsCustomer).toHaveBeenCalledWith(5, "ok");
  });
  it("no SMS when it was confirmed already", async () => {
    db.customer.findUnique.mockResolvedValue({ isApproved: true });
    await call();
    expect(sms.smsCustomer).not.toHaveBeenCalled();
  });
});
