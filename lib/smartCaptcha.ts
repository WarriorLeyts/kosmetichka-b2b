/** Validate once, server-side. Provider/network failures never count as a solved challenge. */
export async function verifySmartCaptcha(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.SMARTCAPTCHA_SERVER_KEY;
  if (!secret || !token) return false;
  try {
    const body = new URLSearchParams({ secret, token, ...(ip ? { ip } : {}) });
    const response = await fetch("https://smartcaptcha.cloud.yandex.ru/validate", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.status === "ok";
  } catch {
    console.warn("[captcha] Verification service unavailable");
    return false;
  }
}
