import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { verifySmartCaptcha } from "./smartCaptcha";
beforeEach(() => { vi.stubEnv("SMARTCAPTCHA_SERVER_KEY", "test-server-key"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("validates once with the documented POST endpoint, keeping secrets out of the URL", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ status: "ok" }));
  expect(await verifySmartCaptcha("test-token", "127.0.0.1")).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("https://smartcaptcha.cloud.yandex.ru/validate");
  expect(options?.method).toBe("POST"); expect(new URLSearchParams(String(options?.body)).get("token")).toBe("test-token");
  expect(options?.signal).toBeInstanceOf(AbortSignal);
});
it("does not accept rejected tokens, HTTP errors, malformed replies or network failures", async () => {
  for (const response of [Response.json({ status: "failed" }), Response.json({ status: "ok" }, { status: 503 }), new Response("invalid")]) {
    vi.mocked(fetch).mockResolvedValueOnce(response); expect(await verifySmartCaptcha("test-token")).toBe(false);
  }
  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline")); expect(await verifySmartCaptcha("test-token")).toBe(false);
});
it("requires a token and server key without contacting the provider", async () => {
  expect(await verifySmartCaptcha("")).toBe(false); vi.stubEnv("SMARTCAPTCHA_SERVER_KEY", "");
  expect(await verifySmartCaptcha("test-token")).toBe(false); expect(fetch).not.toHaveBeenCalled();
});
