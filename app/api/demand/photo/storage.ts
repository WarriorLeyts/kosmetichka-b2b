import path from "path";
import { DATA_ROOT } from "@/lib/dataDir";
export const DEMAND_PHOTO_DIR = path.join(DATA_ROOT, "demand");
export function demandPhotoOwned(name: unknown, customerId?: number): name is string {
  if (typeof name !== "string" || !/^[1-9]\d*_[a-f0-9-]{36}\.webp$/.test(name)) return false;
  return customerId == null || name.startsWith(`${customerId}_`);
}
export function demandPhotoPath(name: string) { return path.join(DEMAND_PHOTO_DIR, name); }
