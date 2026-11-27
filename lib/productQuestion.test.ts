import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_CAMPAIGN } from "@/lib/campaign";
const db = vi.hoisted(() => ({ product: { findUnique: vi.fn() }, orderMessage: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/campaignSettings", () => ({ getCampaign: async () => LEGACY_CAMPAIGN }));
import { buildProductQuestion, buildProductAnswer, chatProductCard, customerChatTextAllowed } from "./productRequest";
beforeEach(() => { vi.clearAllMocks(); db.product.findUnique.mockResolvedValue({ id: 7, name: "Крем", prices: [{ priceType: "retail", price: 1500 }], images: [{ path: "cream.jpg" }], variants: [] }); });
describe("product question and contextual answer", () => {
  it("takes name, photo and price from the server, without an order quantity", async () => {
    const r = await buildProductQuestion({ priceType: "retail" }, { productId: 7, question: " Как использовать? " });
    expect(r).toEqual({ _t: "product-question", id: 7, name: "Крем", variantName: null, imagePath: "cream.jpg", price: 1500, question: "Как использовать?" });
  });
  it.each(["", " ", "a".repeat(1001), null, 12])("rejects empty or invalid question", async question => expect(await buildProductQuestion({}, { productId: 7, question })).toHaveProperty("error"));
  it("only quotes a real customer card from the same order", async () => {
    const text = JSON.stringify({ _t: "product-question", id: 7, name: "Крем", question: "Как использовать?", imagePath: "cream.jpg", variantName: null });
    db.orderMessage.findFirst.mockResolvedValue({ id: 21, text });
    expect(await buildProductAnswer(9, 21, "Наносить по инструкции")).toMatchObject({ _t: "product-answer", replyToMessageId: 21, product: { id: 7, name: "Крем" }, question: "Как использовать?", answer: "Наносить по инструкции" });
    expect(db.orderMessage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 21, orderId: 9, source: "customer", userId: null, isFromPicker: false, automatic: false } }));
    db.orderMessage.findFirst.mockResolvedValue(null); expect(await buildProductAnswer(10, 21, "Ответ")).toBeNull(); expect(await chatProductCard(9, -1)).toBeNull();
  });
  it("customers cannot forge question, answer or added cards in plain text", () => { for (const _t of ["product-question", "product-answer", "product-request"]) expect(customerChatTextAllowed(JSON.stringify({ _t, id: 7, name: "fake", added: true }))).toBe(false); });
});
