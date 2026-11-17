import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ customer: { findUnique: vi.fn() }, customerProof: { count: vi.fn(), create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("../mobile/_auth", () => ({ currentCustomerId: async () => null }));
vi.mock("@/lib/proofs", () => ({ PROOF_DIR: "/proofs", PROOF_LIMITS: {}, PROOF_MAX_FILES: 10, proofType: vi.fn(), verifyProofToken: async () => 7 }));
import { POST } from "./route";
beforeEach(() => vi.resetAllMocks());
it("rejects an old applicant upload token after account deletion or blocking", async () => {
  db.customer.findUnique.mockResolvedValue({ isActive: false });
  const request = new Request("https://site/api/proofs", { method: "POST", headers: { Authorization: "Bearer old-token" } });
  const parse = vi.spyOn(request, "formData");
  expect((await POST(request)).status).toBe(401);
  expect(parse).not.toHaveBeenCalled();
  expect(db.customerProof.create).not.toHaveBeenCalled();
});
it("still accepts active applicants for normal file validation", async () => {
  db.customer.findUnique.mockResolvedValue({ isActive: true });
  const request = new Request("https://site/api/proofs", { method: "POST", headers: { Authorization: "Bearer applicant" } });
  expect((await POST(request)).status).toBe(400);
});
