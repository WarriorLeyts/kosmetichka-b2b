// Returns the correct image URL:
// - R2 full URL (starts with http) → returned as-is
// - local path → prefixed with /1c/ for the local file route
export function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return "/1c/" + path;
}
