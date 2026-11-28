import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { databasePoolUrl } from "../scripts/database-pool.js";
const mock = vi.hoisted(() => ({ construct: vi.fn(), extend: vi.fn(), owner: vi.fn() }));
vi.mock("@prisma/client", () => ({ PrismaClient: class {
  constructor(options: unknown) { mock.construct(options); }
  order = { findUnique: vi.fn() };
  $extends(extension: unknown) { mock.extend(extension); return { marker: "shared-client" }; }
} }));
vi.mock("@/lib/realtime", () => ({ emitForOperation: vi.fn(), setOwnerLookup: mock.owner }));
const globalDb = globalThis as unknown as { prisma?: unknown };
beforeEach(() => { delete globalDb.prisma; vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { delete globalDb.prisma; vi.unstubAllEnvs(); });

it("shares exactly one client/pool across separately loaded production route bundles", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://user:password@db.example/app?sslmode=require");
  const first = (await import("./prisma")).prisma;
  vi.resetModules(); // another bundle evaluates the module in the same process
  const second = (await import("./prisma")).prisma;
  expect(second).toBe(first);
  expect(mock.construct).toHaveBeenCalledTimes(1);
  expect(mock.extend).toHaveBeenCalledTimes(1); // keep the realtime write extension
  expect(mock.owner).toHaveBeenCalledTimes(1);
  const url = new URL(mock.construct.mock.calls[0][0].datasourceUrl);
  expect(url.searchParams.get("connection_limit")).toBe("10");
});
it("bounds the background importer separately and leaves TLS/credentials/options intact", () => {
  const raw = "postgresql://u:p%40ss@db.example:5432/app?sslmode=verify-full&schema=public";
  const url = new URL(databasePoolUrl(raw, "import")!);
  expect(url.searchParams.get("connection_limit")).toBe("2");
  expect(url.searchParams.get("pool_timeout")).toBe("10");
  expect(url.searchParams.get("sslmode")).toBe("verify-full");
  expect(url.searchParams.get("schema")).toBe("public");
  expect(url.password).toBe("p%40ss");
});
it("honors explicit deployment limits and allows Prisma's normal missing-env validation", () => {
  const url = new URL(databasePoolUrl("postgresql://u:p@db/app?connection_limit=4&pool_timeout=7")!);
  expect(url.searchParams.get("connection_limit")).toBe("4");
  expect(url.searchParams.get("pool_timeout")).toBe("7");
  expect(databasePoolUrl(undefined)).toBeUndefined();
});
