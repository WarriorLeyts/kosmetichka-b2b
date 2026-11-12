/**
 * The JWT signing secret — one place for lib/auth.ts, proxy.ts and lib/academy.ts (each had
 * its own copy of the dev fallback). No imports: proxy.ts can use it too.
 */
export function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  // Consider the app "deployed" if either NODE_ENV=production OR NEXT_PUBLIC_SITE_URL is set:
  // this catches NODE_ENV accidentally left as "development" on a real server.
  const isDeployed = process.env.NODE_ENV === "production" || !!process.env.NEXT_PUBLIC_SITE_URL;
  if (isDeployed) {
    throw new Error("JWT_SECRET is not set. Add JWT_SECRET to your environment variables before deploying.");
  }

  // Dev convenience only: a top-level throw here is re-evaluated by the bundler on every recompile
  // and can spin the dev server into a crash loop instead of just failing once. Warn loudly and keep going.
  console.warn("[auth] JWT_SECRET is not set in .env — using a dev-only fallback. Set JWT_SECRET before deploying to production.");
  return "dev-secret-kosmetichka-change-in-production";
}
