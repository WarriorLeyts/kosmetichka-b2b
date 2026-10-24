// Returns the correct image URL:
// - R2 full URL (starts with http) → returned as-is
// - local path → prefixed with /1c/ for the local file route
// - width → smaller WebP copy made by the server (see lib/thumb.ts), e.g. 320 for catalog cards
export function resolveImageUrl(path: string | null | undefined, width?: number): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return "/1c/" + path + (width ? `?w=${width}` : "");
}
