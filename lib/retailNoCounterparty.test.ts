import { afterEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ findUnique: vi.fn(), assignCounterparty: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { customer: { findUnique: io.findUnique } } }));
vi.mock("../scripts/onec-counterparty.js", () => ({ assignCounterparty: io.assignCounterparty }));
vi.mock("./onecOrders", () => ({ kickOrderTo1C: vi.fn() }));
import { assignCustomerGroup, CUSTOMER_GROUPS } from "./onecCustomers";
afterEach(() => vi.unstubAllEnvs());
describe("retail customers stay on the site", () => {
 it.each(["retail", "discount"])("does not create or move %s counterparties in 1С", async (priceType) => {
  vi.stubEnv("ODATA_BASE_URL", "https://example.test"); vi.stubEnv("ODATA_USER", "u"); vi.stubEnv("ODATA_PASSWORD", "p");
  io.findUnique.mockResolvedValue({ id: 1, priceType });
  const result = await assignCustomerGroup(1, CUSTOMER_GROUPS[0]);
  expect(result.ok).toBe(false);
  expect(io.assignCounterparty).not.toHaveBeenCalled();
 });
});
