import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), find: vi.fn(), stat: vi.fn(), read: vi.fn(), encode: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { customerProof: { findUnique: mocks.find } } }));
vi.mock("@/lib/proofs", () => ({ PROOF_DIR: "/private/proofs", verifyProofView: mocks.verify }));
vi.mock("@/lib/proofImage", () => ({ processProofImage: mocks.encode }));
vi.mock("fs/promises", () => ({ stat: mocks.stat, readFile: mocks.read, open: vi.fn() }));
import { GET } from "./route";
const request = () => new Request("https://site/api/proofs/12?t=signed&w=320");
const params = () => ({ params: Promise.resolve({ id: "12" }) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.verify.mockResolvedValue(true); mocks.stat.mockResolvedValue({ size: 4 });
  mocks.find.mockResolvedValue({ kind: "img", mime: "image/jpeg", file: "photo.jpg" });
  mocks.read.mockResolvedValue(Buffer.from("jpeg")); mocks.encode.mockResolvedValue(Buffer.from("webp"));
});
it("verifies the signed proof ID before accessing the database or private file", async () => {
  mocks.verify.mockResolvedValue(false);
  expect((await GET(request(), params())).status).toBe(403);
  expect(mocks.verify).toHaveBeenCalledWith("signed", 12);
  expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it("serves a small private WebP while retaining access protection", async () => {
  const response = await GET(request(), params());
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/webp");
  expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
  expect(mocks.encode).toHaveBeenCalledWith(Buffer.from("jpeg"), 320, true);
});
