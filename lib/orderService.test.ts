import { afterEach, describe, expect, it, vi } from "vitest";
import { orderReceiptText, orderService, responseExpectedAt, responseWindowMinutes } from "./orderService";

const at = (time: string, date = "2026-11-26") => new Date(`${date}T${time}:00+03:00`);
const pending = { status: "pending", createdAt: at("12:00") };
afterEach(() => vi.unstubAllEnvs());

describe("order service information", () => {
  it("does not promise an hour by default or mistake a saved order for a human acknowledgement", () => {
    vi.stubEnv("ORDER_SERVICE_RESPONSE_MINUTES", "");
    expect(responseWindowMinutes()).toBe(0);
    const result = orderService(pending, at("12:10"));
    expect(result).toMatchObject({ phase: "queued", expectedAt: null, managerName: null, startedAt: null, canTake: true, overdue: false });
    expect(result.description).toContain("в очереди");
    expect(orderReceiptText(at("12:00"))).toContain("по очереди");
  });
  it("shows an actual manager only after acknowledgement", () => {
    expect(orderService({ ...pending, serviceStartedAt: at("12:05"), serviceManagerName: "Тестовый менеджер" }, at("12:10"), 0)).toMatchObject({ phase: "checking", canTake: false, managerName: "Тестовый менеджер" });
    expect(orderService({ ...pending, status: "approved" }, at("12:10"), 0).phase).toBe("checking");
    expect(orderService({ ...pending, serviceStartedAt: at("12:05") }, at("12:10"), 0).timingText).toContain("результат проверки в чате");
    expect(orderService(pending, at("12:10"), 60).timingText).toContain("МСК");
  });
  it.each([
    ["08:10", "2026-11-26T10:00:00+03:00"],
    ["09:00", "2026-11-26T10:00:00+03:00"],
    ["12:30", "2026-11-26T13:30:00+03:00"],
    ["18:20", "2026-11-27T09:20:00+03:00"],
    ["18:40", "2026-11-27T10:00:00+03:00"],
    ["23:59", "2026-11-27T10:00:00+03:00"],
  ])("carries the working-hour estimate from %s correctly", (start, end) => {
    expect(responseExpectedAt(at(start), 60)).toEqual(new Date(end));
  });
  it("carries processing across the Moscow year boundary", () => {
    expect(responseExpectedAt(at("18:40", "2026-12-31"), 60)).toEqual(new Date("2027-01-01T10:00:00+03:00"));
  });
  it("late receipts state the real processing hours instead of pretending a manager is present", () => {
    expect(orderReceiptText(at("22:00"), 0)).toContain("09:00 до 19:00");
    expect(orderService({ ...pending, createdAt: at("22:00") }, at("22:01"), 0).description).toContain("в рабочее время");
  });
  it("shows an expired estimate honestly and never restarts it when a manager takes the order", () => {
    const waiting = orderService(pending, at("13:10"), 60);
    const checking = orderService({ ...pending, serviceStartedAt: at("12:55") }, at("13:10"), 60);
    expect(waiting.overdue).toBe(true); expect(checking.overdue).toBe(true);
    expect(waiting.expectedAt).toBe(checking.expectedAt);
    expect(waiting.timingText).toContain("Ответ задерживается");
    expect(checking.timingText).toContain("Проверка заняла больше времени");
  });
  it.each(["assembly", "consultation", "payment", "no_contact", "cancelled", "exported"])("does not offer a new acknowledgement or an old deadline at stage %s", status => {
    const result = orderService({ ...pending, status }, at("20:00"), 60);
    expect(result.canTake).toBe(false); expect(result.expectedAt).toBeNull();
    expect(result.phase).not.toBe("queued");
  });
  it("distinguishes awaiting customer confirmation from an already confirmed order", () => {
    expect(orderService({ ...pending, status: "consultation", customerConfirmed: false }, at("14:00"), 0).title).toContain("Ждём");
    expect(orderService({ ...pending, status: "consultation", customerConfirmed: true }, at("14:00"), 0).title).toContain("Вы подтвердили");
  });
  it.each(["-1", "0", "300", "abc"])("rejects an invalid estimate configuration %s", value => {
    vi.stubEnv("ORDER_SERVICE_RESPONSE_MINUTES", value); expect(responseWindowMinutes()).toBe(0);
  });
});
