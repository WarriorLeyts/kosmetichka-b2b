import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { formatWarehouseStock } from "./warehouseStock";

// Stock per warehouse is for staff only: customers see Product.stock (the total).
// Guard: only staff code (admin, picker, team API, 1C import) may read it.
const STAFF = [/^app\/admin\//, /^app\/api\/admin\//, /^app\/api\/team\//, /^app\/picker\//, /^app\/api\/picker\//, /^app\/api\/1c\//];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("stock per warehouse stays with staff", () => {
  it("no customer page or API reads it", () => {
    const root = path.resolve(__dirname, "..");
    const leaks = [...files(path.join(root, "app")), ...files(path.join(root, "components"))]
      .map((f) => path.relative(root, f).split(path.sep).join("/"))
      .filter((rel) => !STAFF.some((re) => re.test(rel)) && rel !== "components/staff/WarehouseStock.tsx")
      .filter((rel) => /warehouseStock|productWarehouseStock|stockByWarehouse/i.test(fs.readFileSync(path.join(root, rel), "utf8")));
    expect(leaks).toEqual([]);
  });

  it("formats the list", () => {
    expect(formatWarehouseStock([{ name: "Ленина", qty: 5 }, { name: "Мира", qty: 2 }])).toBe("Ленина: 5 · Мира: 2");
    expect(formatWarehouseStock(null)).toBe("");
  });
});
