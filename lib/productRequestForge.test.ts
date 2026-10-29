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
