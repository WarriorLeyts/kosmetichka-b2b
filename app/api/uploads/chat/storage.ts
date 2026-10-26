import path from "path";
import { DATA_ROOT } from "@/lib/dataDir";

/** chat attachments live in data/ (linked from outside the build, survives redeploys) */
export const CHAT_DIR = path.join(DATA_ROOT, "chat");

type T = { kind: "img" | "video" | "file"; mime: string };

const TYPES: Record<string, T> = {
  jpg: { kind: "img", mime: "image/jpeg" },
  jpeg: { kind: "img", mime: "image/jpeg" },
  png: { kind: "img", mime: "image/png" },
  webp: { kind: "img", mime: "image/webp" },
  gif: { kind: "img", mime: "image/gif" },
  heic: { kind: "img", mime: "image/heic" },
  heif: { kind: "img", mime: "image/heif" },
  mp4: { kind: "video", mime: "video/mp4" },
  mov: { kind: "video", mime: "video/quicktime" },
  m4v: { kind: "video", mime: "video/x-m4v" },
  webm: { kind: "video", mime: "video/webm" },
  "3gp": { kind: "video", mime: "video/3gpp" },
  pdf: { kind: "file", mime: "application/pdf" },
  doc: { kind: "file", mime: "application/msword" },
  docx: { kind: "file", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xls: { kind: "file", mime: "application/vnd.ms-excel" },
  xlsx: { kind: "file", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  ppt: { kind: "file", mime: "application/vnd.ms-powerpoint" },
  pptx: { kind: "file", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  odt: { kind: "file", mime: "application/vnd.oasis.opendocument.text" },
  ods: { kind: "file", mime: "application/vnd.oasis.opendocument.spreadsheet" },
  rtf: { kind: "file", mime: "application/rtf" },
  csv: { kind: "file", mime: "text/csv; charset=utf-8" },
  txt: { kind: "file", mime: "text/plain; charset=utf-8" },
  zip: { kind: "file", mime: "application/zip" },
  rar: { kind: "file", mime: "application/vnd.rar" },
  "7z": { kind: "file", mime: "application/x-7z-compressed" },
};

/** allowed types only (no html/svg/js — nothing that could run in the browser) */
export function typeForExt(ext: string): T | null {
  return TYPES[ext] ?? null;
}
