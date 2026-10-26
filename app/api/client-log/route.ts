import { getClientIp, RateLimiter } from "@/lib/rateLimit";

// Client-side error reports (apps / site). Open to everyone, so: rate-limited per IP,
// trimmed, and phones / e-mails are masked before anything reaches the logs.
const limiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

function mask(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>")
    .replace(/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, "<phone>");
}

export async function POST(req: Request) {
  try {
    if (!limiter.check(`clog:${getClientIp(req)}`).ok) return new Response("ok");
    const body = await req.text();
    console.log("[CLIENT-ERROR]", (req.headers.get("user-agent") || "").slice(0, 200), mask(body.slice(0, 3000)));
  } catch {}
  return new Response("ok");
}
