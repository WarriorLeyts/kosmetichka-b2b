import { z } from "zod";

export const STORY_PREFIX = "story:";
export const mediaName = /^story-[a-f0-9]{32}(?:-thumb)?\.(webp|mp4|mov|webm)$/;
const mediaPath = z.string().regex(/^\/api\/stories\/media\/story-[a-f0-9]{32}(?:-thumb)?\.(webp|mp4|mov|webm)$/, "Загрузите фото или видео");
const picturePath = mediaPath.refine(v => v.endsWith(".webp"), "Выберите фото для обложки");

/** Only navigable web links; no script/custom schemes, credentials, protocol-relative URLs or controls. */
export function storyLink(value: string): boolean {
  if (!value) return true;
  if (/[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/(?:catalog(?:\/?\?|\/?$)|product\/\d+\/?(?:\?|$)|info\/?$)/.test(value)) return true;
  try { const u = new URL(value); return u.protocol === "https:" && !!u.hostname && !u.username && !u.password; }
  catch { return false; }
}
export const storySchema = z.object({
  title: z.string().trim().min(1, "Добавьте подпись").max(40, "Подпись — до 40 символов"),
  kind: z.enum(["img", "video"]),
  mediaUrl: mediaPath,
  coverUrl: picturePath,
  link: z.string().trim().max(1000).refine(storyLink, "Укажите ссылку https://… или страницу /product/… либо /catalog"),
  linkLabel: z.string().trim().max(40),
  published: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  position: z.number().int().min(0).max(9999),
}).superRefine((v, ctx) => {
  if ((v.kind === "img") !== v.mediaUrl.endsWith(".webp")) ctx.addIssue({ code: "custom", path: ["mediaUrl"], message: "Тип файла не совпадает с выбранным форматом" });
  if (v.link && !v.linkLabel) ctx.addIssue({ code: "custom", path: ["linkLabel"], message: "Подпишите кнопку со ссылкой" });
});
export type StoryContent = z.infer<typeof storySchema>;
export type Story = StoryContent & { id: string; updatedAt: string };
export function readStory(row: { key: string; value: unknown; updatedAt: Date }): Story | null {
  if (!/^story:[a-f0-9]{32}$/.test(row.key)) return null;
  const r = storySchema.safeParse(row.value);
  return r.success ? { ...r.data, id: row.key.slice(STORY_PREFIX.length), updatedAt: row.updatedAt.toISOString() } : null;
}
export function activeStories(items: Story[], now = Date.now()): Story[] {
  return items.filter(s => s.published && (!s.expiresAt || Date.parse(s.expiresAt) > now))
    .sort((a, b) => a.position - b.position || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 60);
}
