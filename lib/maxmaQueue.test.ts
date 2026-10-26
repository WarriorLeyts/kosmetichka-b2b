import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory MaxmaTask table (only what lib/maxmaQueue.ts uses)
type Row = {
  id: number;
  orderId: number;
  action: string;
  payload: unknown;
  status: string;
  attempts: number;
  lastError: string | null;
  nextAt: Date;
  createdAt: Date;
};
const store = vi.hoisted(() => ({ rows: [] as Row[], seq: 0 }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matches(r: Row, w: any): boolean {
  if (!w) return true;
  if (w.id !== undefined && (typeof w.id === "object" ? !w.id.in.includes(r.id) : r.id !== w.id)) return false;
  if (w.orderId !== undefined && (typeof w.orderId === "object" ? !w.orderId.in.includes(r.orderId) : r.orderId !== w.orderId)) return false;
  if (w.action !== undefined && r.action !== w.action) return false;
  if (w.status !== undefined && (typeof w.status === "object" ? !w.status.in.includes(r.status) : r.status !== w.status)) return false;
  if (w.nextAt !== undefined) {
    if (w.nextAt instanceof Date ? r.nextAt.getTime() !== w.nextAt.getTime() : r.nextAt > w.nextAt.lte) return false;
  }
  if (w.createdAt?.lt && !(r.createdAt < w.createdAt.lt)) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (w.OR && !w.OR.some((o: any) => matches(r, o))) return false;
  return true;
}
const sorted = (rows: Row[]) => [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);

const db = vi.hoisted(() => ({
  maxmaTask: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: vi.fn(async ({ data }: any) => {
      const now = new Date();
      const row = { id: ++store.seq, status: "pending", attempts: 0, lastError: null, nextAt: now, createdAt: now, payload: null, ...data };
      store.rows.push(row);
      return row;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: vi.fn(async ({ where }: any) => sorted(store.rows.filter((r) => matches(r, where)))),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst: vi.fn(async ({ where }: any) => {
      const rows = store.rows.filter((r) => matches(r, where)).sort((a, b) => b.id - a.id);
      return rows[0] ?? null;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn(async ({ where }: any) => store.rows.find((r) => r.id === where.id) ?? null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: vi.fn(async ({ where, data }: any) => Object.assign(store.rows.find((r) => r.id === where.id)!, data)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateMany: vi.fn(async ({ where, data }: any) => {
      const rows = store.rows.filter((r) => matches(r, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    }),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const maxma = vi.hoisted(() => ({
  maxmaConfigured: vi.fn(() => true),
  setLoyaltyOrderQuery: vi.fn(async () => ({ applied: 0, collected: 0, anonymous: false, bonusRows: [] as number[] })),
  confirmOrder: vi.fn(async () => {}),
  cancelOrder: vi.fn(async () => {}),
}));
vi.mock("@/lib/maxma", async (orig) => ({ ...(await orig<typeof import("./maxma")>()), ...maxma }));

import { MaxmaError } from "./maxma";
import {
  enqueueMaxmaTask,
  failureUpdate,
  MAXMA_GIVE_UP_MS,
  maxmaBackoffMs,
  planOrderTasks,
  resetMaxmaTasks,
  runMaxmaQueue,
  runOrderMaxmaTasks,
} from "./maxmaQueue";

const MIN = 60_000;
const query = (applyBonuses = 0) => ({ shop: { code: "online", name: "x" }, rows: [{ id: "0" }], applyBonuses, collectBonuses: "auto" });

beforeEach(() => {
  vi.clearAllMocks();
  store.rows = [];
  store.seq = 0;
  maxma.maxmaConfigured.mockReturnValue(true);
  maxma.setLoyaltyOrderQuery.mockResolvedValue({ applied: 0, collected: 0, anonymous: false, bonusRows: [] });
  maxma.confirmOrder.mockResolvedValue(undefined);
  maxma.cancelOrder.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("backoff", () => {
  it("1, 2, 5, 10, 30 min, then hourly", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map((n) => maxmaBackoffMs(n) / MIN)).toEqual([1, 2, 5, 10, 30, 60, 60]);
    expect(maxmaBackoffMs(0)).toBe(MIN);
  });

  it("failureUpdate: attempts++, next try by backoff, failed after 48 h", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const fresh = failureUpdate({ attempts: 2, createdAt: new Date(now.getTime() - 10 * MIN) }, "boom", now);
    expect(fresh).toEqual({ attempts: 3, lastError: "boom", status: "pending", nextAt: new Date(now.getTime() + 5 * MIN) });
    const old = failureUpdate({ attempts: 50, createdAt: new Date(now.getTime() - MAXMA_GIVE_UP_MS) }, "x".repeat(2000), now);
    expect(old.status).toBe("failed");
    expect(old.lastError).toHaveLength(1000);
  });
});

describe("planOrderTasks", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const t = (id: number, action: string, dueIn = 0, createdAgo = 100 - id) => ({
    id,
    orderId: 1,
    action,
    nextAt: new Date(now.getTime() + dueIn),
    createdAt: new Date(now.getTime() - createdAgo * MIN),
  });

  it("runs only the oldest task (by createdAt, then id)", () => {
    expect(planOrderTasks([t(2, "confirm"), t(1, "set")], 1, now)).toEqual({ skip: [], run: t(1, "set") });
  });

  it("an older task waiting for its retry blocks the newer ones", () => {
    expect(planOrderTasks([t(1, "set", 5 * MIN), t(2, "confirm")], 1, now)).toEqual({ skip: [], run: null });
  });

  it("skips sets superseded by a newer set (any status), then runs the next one", () => {
    expect(planOrderTasks([t(1, "set", 5 * MIN), t(2, "set"), t(3, "confirm")], 2, now)).toEqual({ skip: [1], run: t(2, "set") });
    // the newest set already done → older pending set is stale; confirm runs
    expect(planOrderTasks([t(1, "set"), t(3, "confirm")], 2, now)).toEqual({ skip: [1], run: t(3, "confirm") });
  });

  it("confirm / cancel are never skipped", () => {
    expect(planOrderTasks([t(1, "cancel"), t(2, "set")], 2, now).run?.id).toBe(1);
  });

  it("nothing pending → nothing to do", () => {
    expect(planOrderTasks([], null, now)).toEqual({ skip: [], run: null });
  });
});

describe("queue runner (mocked prisma)", () => {
  it("enqueue runs the task at once and marks it done", async () => {
    await enqueueMaxmaTask(5, "set", query(30) as never);
    // first attempt: MAXMA reserved 0 ≠ 30 → mismatch is an error, retried later
    expect(store.rows[0].status).toBe("pending");
    expect(store.rows[0].lastError).toMatch(/0 бонусов вместо 30/);
    expect(store.rows[0].attempts).toBe(1);
    expect(store.rows[0].nextAt.getTime()).toBeGreaterThan(Date.now() + 50_000);

    maxma.setLoyaltyOrderQuery.mockResolvedValue({ applied: 30, collected: 3, anonymous: false, bonusRows: [30] });
    await resetMaxmaTasks(5);
    const s = await runOrderMaxmaTasks(5);
    expect(s).toMatchObject({ ran: 1, ok: 1, failed: 0 });
    expect(store.rows[0]).toMatchObject({ status: "done", attempts: 2, lastError: null });
  });

  it("runs the order's tasks in order and stops at the first failure", async () => {
    await enqueueMaxmaTask(7, "set", query() as never, { run: false });
    await enqueueMaxmaTask(7, "confirm", null, { run: false });
    maxma.setLoyaltyOrderQuery.mockRejectedValueOnce(new MaxmaError("unavailable", 502, false, "v2/set-order: нет ответа за 8 с"));
    await runOrderMaxmaTasks(7);
    expect(maxma.confirmOrder).not.toHaveBeenCalled(); // confirm never overtakes the failed set
    expect(store.rows[0]).toMatchObject({ status: "pending", attempts: 1, lastError: "v2/set-order: нет ответа за 8 с" });
    expect(store.rows[1]).toMatchObject({ status: "pending", attempts: 0 });

    // the worker ignores it until its retry time…
    expect((await runMaxmaQueue()).ran).toBe(0);
    // …then runs set and confirm in order
    store.rows[0].nextAt = new Date(Date.now() - 1);
    const s = await runMaxmaQueue();
    expect(s).toMatchObject({ ran: 2, ok: 2, failed: 0 });
    expect(maxma.setLoyaltyOrderQuery.mock.invocationCallOrder[1]).toBeLessThan(maxma.confirmOrder.mock.invocationCallOrder[0]);
    expect(store.rows.map((r) => r.status)).toEqual(["done", "done"]);
  });

  it("a superseded set is marked done without calling MAXMA", async () => {
    await enqueueMaxmaTask(8, "set", query(10) as never, { run: false });
    await enqueueMaxmaTask(8, "set", query(0) as never, { run: false });
    await runOrderMaxmaTasks(8);
    expect(maxma.setLoyaltyOrderQuery).toHaveBeenCalledTimes(1);
    expect(maxma.setLoyaltyOrderQuery).toHaveBeenCalledWith(8, query(0));
    expect(store.rows.map((r) => r.status)).toEqual(["done", "done"]);
  });

  it("cancel of an order MAXMA doesn't know is done", async () => {
    maxma.cancelOrder.mockRejectedValueOnce(new MaxmaError("not_found", 404, true));
    await enqueueMaxmaTask(9, "cancel");
    expect(store.rows[0].status).toBe("done");
  });

  it("a leased task (another worker runs it) is not run twice", async () => {
    await enqueueMaxmaTask(10, "confirm", null, { run: false });
    store.rows[0].nextAt = new Date(Date.now() + 2 * MIN); // leased
    expect((await runOrderMaxmaTasks(10)).ran).toBe(0);
    expect(maxma.confirmOrder).not.toHaveBeenCalled();
  });

  it("gives up after 48 h; retry button makes failed tasks pending again", async () => {
    await enqueueMaxmaTask(11, "confirm", null, { run: false });
    store.rows[0].createdAt = new Date(Date.now() - MAXMA_GIVE_UP_MS - MIN);
    maxma.confirmOrder.mockRejectedValueOnce(new MaxmaError("unavailable", 502));
    await runOrderMaxmaTasks(11);
    expect(store.rows[0].status).toBe("failed");
    expect((await runMaxmaQueue()).ran).toBe(0);
    await resetMaxmaTasks(11);
    expect((await runOrderMaxmaTasks(11)).ok).toBe(1);
    expect(store.rows[0].status).toBe("done");
  });

  it("not configured → nothing queued", async () => {
    maxma.maxmaConfigured.mockReturnValue(false);
    await enqueueMaxmaTask(12, "confirm");
    expect(store.rows).toHaveLength(0);
  });
});
