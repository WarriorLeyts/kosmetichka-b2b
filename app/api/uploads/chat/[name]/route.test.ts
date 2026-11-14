import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
const storage = vi.hoisted(() => ({ dir: `/tmp/kosmetichka-voice-range-${Date.now()}` }));
vi.mock("../storage", async (original) => ({ ...(await original<typeof import("../storage")>()), CHAT_DIR: storage.dir }));
import { GET } from "./route";
const name = "chat-1-abcd.m4a";
beforeAll(async () => { await mkdir(storage.dir); await writeFile(`${storage.dir}/${name}`, Buffer.from("0123456789")); });
afterAll(async () => { await rm(storage.dir, { recursive: true, force: true }); });
it("serves audio inline with byte ranges for mobile playback", async () => {
  const r = await GET(new Request("https://x", { headers: { Range: "bytes=2-5" } }), { params: Promise.resolve({ name }) });
  expect(r.status).toBe(206);
  expect(r.headers.get("content-type")).toBe("audio/mp4");
  expect(r.headers.get("content-disposition")).toBe("inline");
  expect(r.headers.get("content-range")).toBe("bytes 2-5/10");
  expect(await r.text()).toBe("2345");
});
