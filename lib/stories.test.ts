import { describe, expect, it } from "vitest";
import { activeStories, readStory, storyLink, storySchema, type Story } from "./stories";
const content = { title: "Новинки", kind: "img", mediaUrl: `/api/stories/media/story-${"a".repeat(32)}.webp`, coverUrl: `/api/stories/media/story-${"a".repeat(32)}-thumb.webp`, link: "/product/123", linkLabel: "Открыть товар", published: true, expiresAt: null, position: 0 };
describe("story publication policy", () => {
  it.each(["javascript:alert(1)", "data:text/html,test", "//evil.test", "https://user:pass@site.test", "https://example.test\\@other.test", "\nhttps://example.test", "/admin", "/catalogue"])("rejects unsupported links %s", link => expect(storyLink(link)).toBe(false));
  it.each(["", "/product/123", "/catalog?quick=promo", "https://kosmetichka-opt.ru/product/123", "https://t.me/shop", "https://wa.me/79389059494", "https://www.instagram.com/shop/"])("allows navigation %s", link => expect(storyLink(link)).toBe(true));
  it("requires uploaded covers and media of the correct type", () => {
    expect(storySchema.safeParse(content).success).toBe(true);
    expect(storySchema.safeParse({ ...content, kind: "video" }).success).toBe(false);
    expect(storySchema.safeParse({ ...content, coverUrl: "https://elsewhere.test/img.jpg" }).success).toBe(false);
    expect(storySchema.safeParse({ ...content, linkLabel: "" }).success).toBe(false);
  });
  it("does not expose drafts or expired stories; lower position first", () => {
    const base = { ...content, id: "a".repeat(32), updatedAt: "2026-11-27T08:00:00.000Z" } as Story;
    const items = [{ ...base, id: "draft", published: false }, { ...base, id: "expired", expiresAt: "2026-11-27T09:00:00.000Z" }, { ...base, id: "later", position: 9 }, { ...base, id: "first", position: 1 }];
    expect(activeStories(items, Date.parse("2026-11-27T09:00:00Z")).map(s => s.id)).toEqual(["first", "later"]);
  });
  it("ignores unrelated or corrupt settings", () => {
    const row = { key: "story:" + "a".repeat(32), value: content, updatedAt: new Date() };
    expect(readStory(row)?.id).toBe("a".repeat(32));
    expect(readStory({ ...row, key: "promo_settings" })).toBeNull();
    expect(readStory({ ...row, value: {} })).toBeNull();
  });
});
