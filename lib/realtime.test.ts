import { describe, expect, it, vi } from "vitest";
import { emitForOperation, onLive, orderChanged, setOwnerLookup, touchedOrders } from "./realtime";

describe("which writes are order changes", () => {
  it("order update / child rows / many-writes", () => {
    expect(touchedOrders("Order", "update", { where: { id: 5 } }, { id: 5, customerId: 2 }).orderIds).toEqual([5]);
    expect(touchedOrders("Order", "updateMany", { where: { id: { in: [1, 2] } } }, { count: 2 }).orderIds).toEqual([1, 2]);
    expect(touchedOrders("OrderMessage", "create", { data: { orderId: 7 } }, { id: 1, orderId: 7 }).orderIds).toEqual([7]);
    expect(touchedOrders("OrderItem", "deleteMany", { where: { orderId: 9 } }, { count: 1 }).orderIds).toEqual([9]);
    expect(touchedOrders("OrderItemChange", "createMany", { data: [{ orderId: 3 }, { orderId: 3 }] }, { count: 2 }).orderIds).toEqual([3]);
    expect(touchedOrders("Notification", "createMany", { data: [{ customerId: 4 }, { customerId: 8 }] }, { count: 2 }).customerIds).toEqual([4, 8]);
  });
  it("reads and other models are not", () => {
    expect(touchedOrders("Order", "findUnique", { where: { id: 5 } }, { id: 5 }).orderIds).toEqual([]);
    expect(touchedOrders("Product", "update", {}, { id: 1 }).orderIds).toEqual([]);
  });
});

describe("events", () => {
  it("several writes of one order → one event with its customer", async () => {
    vi.useFakeTimers();
    setOwnerLookup(async () => 42);
    const got: unknown[] = [];
    const off = onLive((e) => got.push(e));
    orderChanged(11);
    orderChanged(11);
    orderChanged(11);
    await vi.advanceTimersByTimeAsync(100);
    off();
    vi.useRealTimers();
    expect(got).toEqual([{ t: "order", id: 11, customerId: 42 }]);
  });
});

describe("reads never emit (no reload loop)", () => {
  it("findMany / findUnique of orders → nothing; an update → an event", async () => {
    vi.useFakeTimers();
    setOwnerLookup(async () => 7);
    const got: unknown[] = [];
    const off = onLive((e) => got.push(e));
    emitForOperation("Order", "findMany", {}, [{ id: 1, customerId: 7 }, { id: 2, customerId: 7 }]);
    emitForOperation("Order", "findUnique", { where: { id: 3 } }, { id: 3, customerId: 7 });
    emitForOperation("OrderMessage", "findMany", { where: { orderId: 3 } }, [{ id: 9, orderId: 3 }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(got).toEqual([]);
    emitForOperation("Order", "update", { where: { id: 3 } }, { id: 3, customerId: 7 });
    await vi.advanceTimersByTimeAsync(100);
    off();
    vi.useRealTimers();
    expect(got).toEqual([{ t: "order", id: 3, customerId: 7 }]);
  });
});
