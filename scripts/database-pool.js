/** Bounded pools for a database with 25 connections; leave room for imports and maintenance.
 * Explicit deployment settings win. Do not change TLS, host, credentials or other URL options.
 */
export function databasePoolUrl(raw, workload = "web") {
  if (!raw) return undefined;
  const url = new URL(raw);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", workload === "import" ? "2" : "10");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "10");
  return url.toString();
}
