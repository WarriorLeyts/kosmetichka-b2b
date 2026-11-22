import { prisma } from "@/lib/prisma";
import { verifyProofToken } from "@/lib/proofs";
import { currentCustomerId } from "../mobile/_auth";

export async function proofOwner(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const id = bearer ? await verifyProofToken(bearer) : await currentCustomerId();
  if (!id) return null;
  const customer = await prisma.customer.findUnique({ where: { id }, select: { isActive: true } });
  return customer?.isActive ? id : null;
}
