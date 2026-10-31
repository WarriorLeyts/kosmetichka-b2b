import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { isForgedProductRequest } from "./productRequest";

describe("isForgedProductRequest", () => {
  it("catches a card typed by the customer, also with JSON escapes", () => {
    expect(isForgedProductRequest('{"_t":"product-request","id":1,"name":"x"}')).toBe(true);
    expect(isForgedProductRequest('{"\\u005ft":"product-request","id":1,"name":"x"}')).toBe(true);
    expect(isForgedProductRequest(' {"_t" : "product\\u002drequest"}')).toBe(true);
  });
  it("lets ordinary text and other cards through", () => {
    expect(isForgedProductRequest("Хочу добавить товар")).toBe(false);
    expect(isForgedProductRequest("{не json")).toBe(false);
    expect(isForgedProductRequest('{"_t":"img","url":"/api/uploads/chat/a.jpg"}')).toBe(false);
  });
});

describe("what a customer may send to the chat", () => {
  it("text and own attachments pass", async () => {
    const { customerChatTextAllowed } = await import("./productRequest");
    expect(customerChatTextAllowed("Здравствуйте")).toBe(true);
    expect(customerChatTextAllowed("{скобка в тексте")).toBe(true);
    expect(customerChatTextAllowed('{"a":1}')).toBe(true);
    expect(customerChatTextAllowed(JSON.stringify({ _t: "img", url: "/api/uploads/chat/chat-1-ab.jpg" }))).toBe(true);
    expect(customerChatTextAllowed(JSON.stringify({ _t: "file", url: "/api/uploads/chat/chat-1-ab.pdf", name: "a.pdf", size: 3 }))).toBe(true);
  });
  it("staff cards and foreign links are refused", async () => {
    const { customerChatTextAllowed } = await import("./productRequest");
    expect(customerChatTextAllowed(JSON.stringify({ _t: "order-change", title: "Заказ изменён" }))).toBe(false);
    expect(customerChatTextAllowed(JSON.stringify({ _t: "product", id: 1, name: "x", price: 1 }))).toBe(false);
    expect(customerChatTextAllowed(JSON.stringify({ _t: "img", url: "https://evil.example/x.jpg" }))).toBe(false);
    expect(customerChatTextAllowed(JSON.stringify({ _t: "file", url: "/api/uploads/chat/../../etc" }))).toBe(false);
  });
});
