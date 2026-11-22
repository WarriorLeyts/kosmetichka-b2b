import { beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ writeFile: vi.fn(), mkdir: vi.fn(), unlink: vi.fn(), encode: vi.fn() }));
const db = vi.hoisted(() => ({ customer: { findUnique: vi.fn() }, customerProof: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn() }));
vi.mock("fs/promises", () => io);
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/proofImage", () => ({ processProofImage: io.encode }));
vi.mock("../mobile/_auth", () => ({ currentCustomerId: async () => 7 }));
vi.mock("@/lib/proofs", async original => ({ ...await original<typeof import("@/lib/proofs")>(), verifyProofToken: async () => 7 }));
import { GET, POST } from "./route";
const request = (uploadId = "proof-test-123", name = "photo.png", bytes = "large input") => {
  const form = new FormData();form.append("file",new File([bytes],name,{type:"image/png"}));form.append("uploadId",uploadId);form.append("customerId","999");
  return new Request("https://site/api/proofs", { method:"POST",body:form });
};
beforeEach(() => {
  vi.resetAllMocks();io.unlink.mockResolvedValue(undefined);io.writeFile.mockResolvedValue(undefined);io.mkdir.mockResolvedValue(undefined);db.customer.findUnique.mockResolvedValue({isActive:true});db.customerProof.findUnique.mockResolvedValue(null);db.customerProof.count.mockResolvedValue(0);
  db.$transaction.mockImplementation(fn=>fn(db));io.encode.mockResolvedValue(Buffer.from("jpeg"));
  db.customerProof.create.mockImplementation(async ({data})=>({id:12,...data}));
});
describe("proof delivery",()=>{
  it("saves a compressed JPEG with its actual size under the authenticated customer",async()=>{
    const result=await POST(request());expect(result.status).toBe(200);expect(await result.json()).toMatchObject({id:12,size:4});
    expect(db.customerProof.create).toHaveBeenCalledWith({data:expect.objectContaining({customerId:7,uploadId:"proof-test-123",mime:"image/jpeg",size:4,file:expect.stringMatching(/\.jpg$/)})});
    expect(db.$queryRaw).toHaveBeenCalled();expect(io.unlink).not.toHaveBeenCalled();
  });
  it("reuses a received file after a lost response, even at the ten-file limit",async()=>{
    db.customerProof.findUnique.mockResolvedValue({id:12,kind:"img",size:4});db.customerProof.count.mockResolvedValue(10);
    expect((await POST(request())).status).toBe(200);expect(db.customerProof.create).not.toHaveBeenCalled();expect(io.encode).not.toHaveBeenCalled();expect(io.writeFile).not.toHaveBeenCalled();
    expect(db.customerProof.findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{customerId_uploadId:{customerId:7,uploadId:"proof-test-123"}}}));
  });
  it("enforces the limit inside the serialized transaction and removes an uncommitted disk file",async()=>{
    db.customerProof.count.mockResolvedValue(10);const result=await POST(request());expect(result.status).toBe(400);expect((await result.json()).error).toContain("10");expect(db.customerProof.create).not.toHaveBeenCalled();expect(io.unlink).toHaveBeenCalledTimes(1);
  });
  it("does not leave an orphan when the database fails",async()=>{
    db.customerProof.create.mockRejectedValue(new Error("db down"));expect((await POST(request())).status).toBe(503);expect(io.unlink).toHaveBeenCalledTimes(1);
  });
  it("rejects corrupt photos before writing a file",async()=>{
    io.encode.mockRejectedValue(new Error("decode failed"));expect((await POST(request())).status).toBe(400);expect(io.writeFile).not.toHaveBeenCalled();
  });
  it("reports actual server receipts for resuming, scoped to one account",async()=>{
    db.customerProof.findMany.mockResolvedValue([{id:12,uploadId:"proof-test-123",kind:"img",size:4}]);db.customer.findUnique.mockResolvedValue({isActive:true,proofUploadExpected:2,proofUploadCompletedAt:null});
    const result=await GET(new Request("https://site/api/proofs"));expect(await result.json()).toMatchObject({files:[{id:12,uploadId:"proof-test-123"}],expected:2,completed:false});
    expect(db.customerProof.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{customerId:7}}));
  });
});
