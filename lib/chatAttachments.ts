/**
 * Chat attachments (customer ↔ manager, manager ↔ picker): photo, video, file.
 * A message with an attachment is stored as JSON text, like the existing photo/product cards:
 *   {"_t":"img","url"}  ·  {"_t":"video","url","name","size"}  ·  {"_t":"file","url","name","size"}
 * Shared by the site, the admin panel and the mobile app.
 */

export type ChatUploadKind = "img" | "video" | "file";

export type ChatUpload = { url: string; kind: ChatUploadKind; name: string; size: number; mime: string };

/** what the chat upload accepts (used for <input accept> as well) */
export const CHAT_ACCEPT =
  "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.ods,.ppt,.pptx,.zip,.rar,.7z";

/** message text for an uploaded attachment */
export function attachmentMessage(u: ChatUpload): string {
  if (u.kind === "img") return JSON.stringify({ _t: "img", url: u.url });
  return JSON.stringify({ _t: u.kind, url: u.url, name: u.name, size: u.size });
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

/** short human text for notifications / previews */
export function attachmentPreview(text: string): string | null {
  try {
    const o = JSON.parse(text) as { _t?: string; name?: string; title?: string };
    if (o?._t === "order-change") return `✏️ ${o.title ?? "Заказ изменён"}`;
    if (o?._t === "product") return `📦 ${o.name ?? "Товар"}`;
    if (o?._t === "img") return "📷 Фото";
    if (o?._t === "video") return "🎬 Видео";
    if (o?._t === "file") return `📎 ${o.name ?? "Файл"}`;
  } catch {}
  return null;
}
