import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

vi.mock("@/lib/jwtSecret", () => ({ resolveJwtSecret: () => "test-secret" }));
import { config, proxy } from "./proxy";

function request(path: string, method = "GET", host = "admin.kosmetichka-opt.ru") {
  return new NextRequest(`https://${host}${path}`, {
    method,
    headers: { host, ...(method === "POST" ? { "content-type": "multipart/form-data; boundary=broken" } : {}) },
    ...(method === "POST" ? { body: "invalid multipart body" } : {}),
  });
}

describe("CMS page methods", () => {
  it.each(["/", "/products", "/login", "/cms", "/cms/products"])("rejects malformed POST to %s before rewriting or redirecting", async (path) => {
    const req = request(path, "POST");
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: req.url, headers: { host: req.headers.get("host")! } })).toBe(true);
    const res = await proxy(req);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(req.bodyUsed).toBe(false);
  });

  it.each(["PUT", "PATCH", "DELETE", "OPTIONS"])("rejects %s on the dashboard", async (method) => {
    expect((await proxy(request("/", method))).status).toBe(405);
  });

  it.each(["GET", "HEAD"])("preserves %s navigation", async (method) => {
    const res = await proxy(request("/products?stock=in", method));
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://admin.kosmetichka-opt.ru/cms/products?stock=in");
    expect((await proxy(request("/cms/products", method))).status).toBe(307);
  });

  it.each(["/api/admin/login", "/api/cms/upload", "/api/cms/logout"])("preserves API POST to %s", async (path) => {
    const res = await proxy(request(path, "POST"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps CMS inaccessible on the shop host", async () => {
    expect((await proxy(request("/cms", "POST", "kosmetichka-opt.ru"))).status).toBe(404);
  });

  it("also protects the local CMS host", async () => {
    expect((await proxy(request("/", "POST", "admin.localhost"))).status).toBe(405);
  });
});
