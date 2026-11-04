import path from "path";
import { SignJWT, jwtVerify } from "jose";
import { DATA_ROOT } from "@/lib/dataDir";
import { resolveJwtSecret } from "@/lib/jwtSecret";

/**
 * Wholesale proof: photos / videos showing the applicant resells (his shop, online orders).
 * Files live in DATA_DIR/proofs (outside the build, like chat files) and are shown only to staff.
 */
export const PROOF_DIR = path.join(DATA_ROOT, "proofs");

const MB = 1024 * 1024;
export const PROOF_LIMITS = { img: 15 * MB, video: 50 * MB } as const;
/** files per customer */
export const PROOF_MAX_FILES = 10;

const TYPES: Record<string, { kind: "img" | "video"; mime: string }> = {
  jpg: { kind: "img", mime: "image/jpeg" },
  jpeg: { kind: "img", mime: "image/jpeg" },
  png: { kind: "img", mime: "image/png" },
  webp: { kind: "img", mime: "image/webp" },
  heic: { kind: "img", mime: "image/heic" },
  heif: { kind: "img", mime: "image/heif" },
  mp4: { kind: "video", mime: "video/mp4" },
  mov: { kind: "video", mime: "video/quicktime" },
  m4v: { kind: "video", mime: "video/x-m4v" },
  webm: { kind: "video", mime: "video/webm" },
  "3gp": { kind: "video", mime: "video/3gpp" },
};

/** photos and videos only */
export function proofType(fileName: string) {
  const ext = (fileName.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = TYPES[ext];
  return t ? { ...t, ext } : null;
}

export const SHOP_TYPES = ["offline", "online", "both"] as const;
export type ShopType = (typeof SHOP_TYPES)[number];
export const SHOP_TYPE_LABELS: Record<ShopType, string> = { offline: "Магазин (офлайн)", online: "Онлайн-магазин", both: "Магазин и онлайн" };

/**
 * Checks «где вы продаёте» of a wholesale application: the type, and a link for an online shop.
 * Returns the cleaned values or an error text.
 */
export function shopFields(body: { shopType?: unknown; shopLink?: unknown }): { shopType: ShopType; shopLink: string | null } | { error: string; field: string } {
  const shopType = String(body.shopType ?? "");
  if (!(SHOP_TYPES as readonly string[]).includes(shopType)) return { error: "Укажите, где вы продаёте: магазин или онлайн", field: "shopType" };
  const shopLink = String(body.shopLink ?? "").trim().slice(0, 300) || null;
  if (shopType !== "offline" && (!shopLink || shopLink.length < 4)) {
    return { error: "Укажите ссылку на онлайн-магазин: сайт, Instagram или маркетплейс", field: "shopLink" };
  }
  return { shopType: shopType as ShopType, shopLink };
}

const secret = () => new TextEncoder().encode(resolveJwtSecret());

/**
 * Upload pass for a wholesale applicant right after registration: his account waits for approval,
 * so he can't sign in yet. 3 days, only for adding proof files to that one customer.
 */
export async function createProofToken(customerId: number) {
  return await new SignJWT({ id: 0, role: "proof", cid: customerId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("3d")
    .sign(secret());
}

export async function verifyProofToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "proof" && typeof payload.cid === "number" ? payload.cid : null;
  } catch {
    return null;
  }
}

/** A 1-hour link to one proof file for staff (the Team app shows images and opens videos by plain URL). */
export async function proofViewUrl(proofId: number) {
  const t = await new SignJWT({ id: 0, role: "proofview", pid: proofId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret());
  return `/api/proofs/${proofId}?t=${encodeURIComponent(t)}`;
}

export async function verifyProofView(token: string, proofId: number): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "proofview" && payload.pid === proofId;
  } catch {
    return false;
  }
}
