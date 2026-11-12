import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  order: {
    updateMany: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async () => ({})),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(async () => ({ oneCNumber: null as string | null, oneCStockNumber: null, oneCError: null as string | null })),
  },
  oneCOrderAttempt: { create: vi.fn(async () => ({})) },
}));
const one = vi.hoisted(() => ({ problems: [] as string[] }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/maxmaOrders", () => ({ MAXMA_ORDER_WHERE: {}, onOrderStatus: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyOrderStatus: vi.fn() }));
vi.mock("../scripts/onec-orders.js", async (orig) => {
  const real = await orig<typeof import("../scripts/onec-orders.js")>();
  return {
    ...real,
    loadOrder: async () => ({ id: 77, createdAt: new Date("2026-11-12T08:00:00Z"), comment: "", customer: { priceType: "retail", name: "Диана" }, items: [] }),
    prepareOrder: async () => ({ problems: one.problems, counterpartyRef: "c", body: { Number: "СА-000077" } }),
    findOrderDoc: async () => null,
    createOrderDoc: async (body: { Number: string }) => ({ Ref_Key: "ref-77", Number: body.Number }),
  };
});

import { sendOrderTo1C } from "./onecOrders";

beforeEach(() => {
  vi.clearAllMocks();
  one.problems = [];
  db.order.updateMany.mockResolvedValue({ count: 1 });
  Object.assign(process.env, { ORDERS_TO_1C: "odata", ODATA_BASE_URL: "x", ODATA_USER: "u", ODATA_PASSWORD: "p" });
});

describe("every try to send an order to 1С goes to the log", () => {
  it("a created document: its number, who pressed the button", async () => {
    db.order.findUnique.mockResolvedValueOnce({ oneCNumber: "СА-000077", oneCStockNumber: null, oneCError: null });
    expect(await sendOrderTo1C(77, { trigger: "manual", by: "Мадина" })).toBe("created");
    expect(db.oneCOrderAttempt.create).toHaveBeenCalledTimes(1);
    expect(db.oneCOrderAttempt.create.mock.calls[0]).toMatchObject([{ data: { orderId: 77, outcome: "created", trigger: "manual", by: "Мадина", docNumber: "СА-000077", error: null } }]);
  });

  it("a data problem: the error the order got", async () => {
    one.problems = ["Покупатель «Диана» не найден в 1С"];
    db.order.findUnique.mockResolvedValueOnce({ oneCNumber: null, oneCStockNumber: null, oneCError: "Покупатель «Диана» не найден в 1С" });
    expect(await sendOrderTo1C(77)).toBe("problem");
    expect(db.oneCOrderAttempt.create.mock.calls[0]).toMatchObject([{ data: { outcome: "problem", trigger: "auto", docNumber: null, error: "Покупатель «Диана» не найден в 1С" } }]);
  });

  it("no try (another sender holds the order) — nothing is logged", async () => {
    db.order.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await sendOrderTo1C(77)).toBe("skipped");
    expect(db.oneCOrderAttempt.create).not.toHaveBeenCalled();
  });

  it("a broken log never breaks the sending", async () => {
    db.oneCOrderAttempt.create.mockRejectedValueOnce(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendOrderTo1C(77)).toBe("created");
    warn.mockRestore();
  });
});
