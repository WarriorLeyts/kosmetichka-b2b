import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  order: { count: vi.fn(), findUnique: vi.fn() },
  customer: { count: vi.fn(), findUnique: vi.fn() },
  oneCCustomer: { groupBy: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { assignableGroups, customerScopeWhere, orderScopeWhere, orderVisible, staffScope } from "./staffScope";
import { recipientsWhere } from "./staffNotify";

beforeEach(() => Object.values(db).forEach((m) => Object.values(m).forEach((f) => f.mockReset())));

describe("staffScope", () => {
  it("admin and picker see everything", async () => {
    expect(await staffScope({ id: 1, role: "admin" })).toEqual({ all: true });
    expect(await staffScope({ id: 2, role: "picker" })).toEqual({ all: true });
    expect(orderScopeWhere({ all: true })).toEqual({});
  });
  it("a manager — his 1С group only", async () => {
    db.user.findUnique.mockResolvedValue({ oneCGroup: "Ахтаева Инсана" });
    const sc = await staffScope({ id: 5, role: "manager" });
    expect(sc).toEqual({ all: false, group: "Ахтаева Инсана" });
    expect(orderScopeWhere(sc)).toEqual({ customer: { manager: "Ахтаева Инсана" } });
    expect(customerScopeWhere(sc)).toEqual({ manager: "Ахтаева Инсана" });
  });
  it("a manager without a group (or with an admin-only one) sees nobody", async () => {
    for (const g of [null, "", "Раяна", "Отдел Продаж"]) {
      db.user.findUnique.mockResolvedValue({ oneCGroup: g });
      const sc = await staffScope({ id: 5, role: "manager" });
      expect(sc).toEqual({ all: false, group: null });
      const w = customerScopeWhere(sc) as { manager: string };
      expect(typeof w.manager).toBe("string");
      expect(["Раяна", "Отдел Продаж", ""]).not.toContain(w.manager);
    }
  });
  it("orderVisible checks the order against the group", async () => {
    db.order.count.mockResolvedValue(0);
    expect(await orderVisible({ all: false, group: "Даудова Радима" }, 211)).toBe(false);
    expect(db.order.count).toHaveBeenCalledWith({ where: { id: 211, customer: { manager: "Даудова Радима" } } });
    expect(await orderVisible({ all: true }, 211)).toBe(true);
  });
  it("assignable groups: current 1С groups without «Раяна» / «Отдел Продаж»", async () => {
    db.oneCCustomer.groupBy.mockResolvedValue([{ manager: "Раяна" }, { manager: "Даудова Радима" }, { manager: "Отдел Продаж" }, { manager: "Ахтаева Инсана" }]);
    expect(await assignableGroups()).toEqual(["Ахтаева Инсана", "Даудова Радима"]);
  });
});

describe("staff notifications go to the customer's manager and admins", () => {
  it("an order of a manager's customer", async () => {
    db.order.findUnique.mockResolvedValue({ customer: { manager: "Лорсанова Милана" } });
    expect(await recipientsWhere({ kind: "new-order", orderId: 1 })).toEqual({ OR: [{ role: "admin" }, { role: "manager", oneCGroup: "Лорсанова Милана" }] });
  });
  it("no manager / «Отдел Продаж» — admins only", async () => {
    db.order.findUnique.mockResolvedValue({ customer: { manager: null } });
    expect(await recipientsWhere({ kind: "chat", orderId: 1, text: "?" })).toEqual({ role: "admin" });
    db.customer.findUnique.mockResolvedValue({ manager: "Отдел Продаж" });
    expect(await recipientsWhere({ kind: "customer-request", customerId: 3, request: "wholesale", signup: true })).toEqual({ role: "admin" });
  });
});
