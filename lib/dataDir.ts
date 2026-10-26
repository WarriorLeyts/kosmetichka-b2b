import path from "path";

/**
 * Folder with the 1C exchange files, product photos (1c/) and chat files (chat/).
 * In production DATA_DIR points to a folder outside the build (~/kosmetichka-data), so
 * `next build` — which wipes .next/standalone — never touches it, even while 1C is
 * uploading files during a deploy. Without DATA_DIR: <cwd>/data, as before.
 */
export const DATA_ROOT = process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
