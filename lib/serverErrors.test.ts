import { describe, expect, it } from "vitest";
import { serverErrorLine } from "./serverErrors";

describe("server error line for the monitor", () => {
  it("keeps the path without the query, the first line of the message", () => {
    const line = JSON.parse(
      serverErrorLine(new Error("boom\n  at x.ts:1"), { path: "/api/orders?phone=79990001122", method: "POST" }, { routePath: "/api/orders", routeType: "route" }, new Date("2026-11-12T10:00:00Z"))
    );
    expect(line).toEqual({ at: "2026-11-12T10:00:00.000Z", method: "POST", path: "/api/orders", route: "/api/orders", type: "route", message: "boom" });
  });
  it("a React error keeps its digest", () => {
    const e = Object.assign(new Error("x"), { digest: "123" });
    expect(JSON.parse(serverErrorLine(e, { path: "/" }, {})).digest).toBe("123");
  });
  it("reports a Prisma pool timeout without leaking its query or values", () => {
    const e = Object.assign(new Error("\nInvalid prisma.customer.findUnique() invocation:\nphone: 79990001122\nTimed out fetching a new connection"), { code: "P2024" });
    const line = serverErrorLine(e, { path: "/api/catalog/products?search=private" }, {});
    expect(JSON.parse(line).message).toBe("P2024: Database connection pool exhausted (wait timeout)");
    expect(line).not.toContain("79990001122");
    expect(line).not.toContain("private");
  });
  it("keeps unknown Prisma failures useful without including database values", () => {
    const e = Object.assign(new Error("\nSQL with secret values"), { code: "P2002" });
    expect(JSON.parse(serverErrorLine(e, {}, {})).message).toBe("P2002: Database request failed");
  });
  it("does not emit an empty message for multiline or empty errors", () => {
    expect(JSON.parse(serverErrorLine(new Error("\n\n  socket closed\nstack"), {}, {})).message).toBe("socket closed");
    expect(JSON.parse(serverErrorLine(new Error(""), {}, {})).message).toBe("Unknown server error");
  });
});
