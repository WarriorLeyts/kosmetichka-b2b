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
});
