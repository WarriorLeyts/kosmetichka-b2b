import { describe, expect, it } from "vitest";
import { checkTestDraft, normalizeCode, slugify } from "./academy-tests";

const q = (over: Record<string, unknown> = {}) => ({
  productId: 121133,
  text: "Bioderma Pigmentbio\nДля чего эта сыворотка?",
  options: [
    { text: "Пигментация", isCorrect: true },
    { text: "Объём волос", isCorrect: false },
  ],
  ...over,
});
const ok = { title: "Уход за кожей", description: "", passScore: 80, timeLimitMin: "", isPublished: true, questions: [q()] };

describe("checkTestDraft", () => {
  it("принимает нормальный тест и чистит его", () => {
    const r = checkTestDraft({ ...ok, title: "  Уход   за кожей ", questions: [q({ options: [...q().options, { text: "  ", isCorrect: false }] })] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.title).toBe("Уход за кожей");
      expect(r.data.timeLimitMin).toBeNull();
      expect(r.data.description).toBeNull();
      expect(r.data.questions[0].options).toHaveLength(2); // пустой вариант отброшен
    }
  });

  it.each([
    [{ ...ok, title: "ab" }, "название"],
    [{ ...ok, passScore: 0 }, "Проходной"],
    [{ ...ok, passScore: 80.5 }, "Проходной"],
    [{ ...ok, timeLimitMin: 0 }, "Время"],
    [{ ...ok, questions: [] }, "хотя бы один"],
    [{ ...ok, questions: [q({ text: "" })] }, "текст вопроса"],
    [{ ...ok, questions: [q({ options: [{ text: "Один", isCorrect: true }] })] }, "минимум 2"],
    [{ ...ok, questions: [q({ options: [{ text: "А", isCorrect: false }, { text: "Б", isCorrect: false }] })] }, "отметьте правильный"],
    [{ ...ok, questions: [q({ options: [{ text: "А", isCorrect: true }, { text: "Б", isCorrect: true }] })] }, "все варианты"],
    [{ ...ok, questions: [q({ options: [{ text: "А", isCorrect: true }, { text: "а", isCorrect: false }] })] }, "повторяются"],
    [{ ...ok, questions: [q({ productId: -3 })] }, "неверный товар"],
  ])("отклоняет %#", (input, msg) => {
    const r = checkTestDraft(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it("номер вопроса с ошибкой", () => {
    const r = checkTestDraft({ ...ok, questions: [q(), q({ text: "" })] });
    expect(r).toMatchObject({ ok: false, question: 1 });
    if (!r.ok) expect(r.error).toMatch(/^Вопрос 2/);
  });

  it("вопрос без товара допустим, несколько правильных — тоже", () => {
    const r = checkTestDraft({ ...ok, questions: [q({ productId: null, options: [{ text: "А", isCorrect: true }, { text: "Б", isCorrect: true }, { text: "В", isCorrect: false }] })] });
    expect(r.ok).toBe(true);
  });
});

describe("slugify / normalizeCode", () => {
  it("адрес из русского названия", () => {
    expect(slugify("Уход за волосами: шампуни")).toBe("uhod-za-volosami-shampuni");
    expect(slugify("!!!")).toBe("test");
  });
  it("код номенклатуры", () => {
    expect(normalizeCode(" цб0000 12380 ")).toBe("ЦБ000012380");
  });
});
