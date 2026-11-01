import { describe, expect, it } from "vitest";
import { importState, startImport } from "./importJob";

describe("import jobs", () => {
  it("a quick import answers with its result", async () => {
    const st = await startImport("t1", async () => ({ n: 5 }), "err", 1000);
    expect(st.status).toBe("done");
    expect(st.result).toEqual({ n: 5 });
  });
  it("a long one keeps running; a second start doesn't run it twice", async () => {
    let runs = 0;
    let finish: (v: { n: number }) => void = () => {};
    const run = () => {
      runs++;
      return new Promise<{ n: number }>((r) => (finish = r));
    };
    expect((await startImport("t2", run, "err", 10)).status).toBe("running");
    expect((await startImport("t2", run, "err", 10)).status).toBe("running");
    expect(runs).toBe(1);
    finish({ n: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(importState("t2").status).toBe("done");
  });
  it("a failure is reported with the given text", async () => {
    const st = await startImport("t3", async () => { throw new Error("boom"); }, "Ошибка импорта", 1000);
    expect(st).toMatchObject({ status: "error", error: "Ошибка импорта" });
  });
});
