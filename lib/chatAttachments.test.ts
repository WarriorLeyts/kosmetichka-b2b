import { expect, it } from "vitest";
import { attachmentMessage, attachmentPreview } from "./chatAttachments";
it("voice messages have a readable preview and keep the attachment format", () => {
  const text = attachmentMessage({ url: "/api/uploads/chat/chat-1-abcd.m4a", kind: "audio", name: "voice.m4a", size: 100, mime: "audio/mp4" });
  expect(JSON.parse(text)._t).toBe("audio");
  expect(attachmentPreview(text)).toBe("🎤 Голосовое сообщение");
});
