import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ order: { findUnique: vi.fn() }, orderMessage: { findFirst: vi.fn(), create: vi.fn() }, question: vi.fn(), request: vi.fn(), notify: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("@/lib/customerAuth", () => ({ verifyCustomerToken: async () => ({ id: 3 }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { order: m.order, orderMessage: m.orderMessage, customer: { findUnique: async () => ({ priceType: "retail" }) } } }));
vi.mock("@/lib/productRequest", () => ({ buildProductQuestion: m.question, buildProductRequest: m.request, customerChatTextAllowed: () => false, isForgedProductRequest: () => false, PRODUCT_REQUEST_STATUSES: ["pending", "approved", "assembly", "consultation"] }));
vi.mock("@/lib/staffNotify", () => ({ notifyStaffLater: m.notify }));
vi.mock("@/lib/rateLimit", () => ({ messageLimiter: { check: () => ({ ok: true }) } }));
vi.mock("@/lib/orderTier", () => ({ orderTier: () => "retail" }));
import { POST } from "./messages/route";
const card = { _t: "product-question", id: 7, name: "Крем", question: "Как использовать?" };
const call = (body: unknown) => POST(new Request("https://test", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "9" }) });
beforeEach(() => { vi.clearAllMocks(); m.order.findUnique.mockResolvedValue({ id: 9, customerId: 3, status: "assembly" }); m.question.mockResolvedValue(card); m.request.mockResolvedValue({ ...card, _t: "product-request", quantity: 2 }); m.orderMessage.findFirst.mockResolvedValue(null); m.orderMessage.create.mockImplementation(async ({ data }) => ({ id: 21, ...data, createdAt: new Date() })); });
describe("customer product intent endpoint", () => {
  it("can ask after completion without adding order lines", async () => { m.order.findUnique.mockResolvedValueOnce({ id: 9, customerId: 3, status: "exported" }); expect((await call({ productQuestion: { productId: 7, question: "Как использовать?" } })).status).toBe(200); expect(m.question).toHaveBeenCalled(); expect(m.orderMessage.create).toHaveBeenCalledOnce(); });
  it("does not allow adding after completion or sending two intents", async () => { m.order.findUnique.mockResolvedValueOnce({ id: 9, customerId: 3, status: "exported" }); expect((await call({ productRequest: { productId: 7, quantity: 2 } })).status).toBe(400); expect((await call({ productQuestion: {}, productRequest: {} })).status).toBe(400); expect(m.orderMessage.create).not.toHaveBeenCalled(); });
  it("returns the saved card after a lost response without another message or notification", async () => { m.orderMessage.findFirst.mockResolvedValueOnce({ id: 21, text: JSON.stringify(card), createdAt: new Date() }); expect((await call({ requestId: "chat-12345678", productQuestion: { productId: 7, question: "Как использовать?" } })).status).toBe(200); expect(m.orderMessage.create).not.toHaveBeenCalled(); expect(m.notify).not.toHaveBeenCalled(); });
  it("refuses another customer's order", async () => { m.order.findUnique.mockResolvedValueOnce({ id: 9, customerId: 55, status: "assembly" }); expect((await call({ productQuestion: { productId: 7, question: "Как использовать?" } })).status).toBe(404); expect(m.question).not.toHaveBeenCalled(); });
});
