import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/auth", () => ({ verifyToken: vi.fn() }));

import { gradeAttempt, type GradeQuestion } from "./academy";
import { plural } from "./academy-format";

const qs: GradeQuestion[] = [
  { id: 1, text: "Один ответ", options: [{ id: 11, text: "да", isCorrect: true }, { id: 12, text: "нет", isCorrect: false }] },
  {
    id: 2,
    text: "Несколько ответов",
    options: [
      { id: 21, text: "a", isCorrect: true },
      { id: 22, text: "b", isCorrect: true },
      { id: 23, text: "c", isCorrect: false },
    ],
  },
];

describe("gradeAttempt", () => {
  it("засчитывает только точный набор правильных вариантов", () => {
    const r = gradeAttempt(qs, { "1": [11], "2": [21] }, 80);
    expect(r.details.map((d) => d.correct)).toEqual([true, false]);
    expect(r.score).toBe(50);
    expect(r.passed).toBe(false);
  });

  it("лишний неправильный вариант делает ответ неверным", () => {
    expect(gradeAttempt(qs, { "2": [21, 22, 23] }, 50).details[1].correct).toBe(false);
  });

  it("все верно — 100% и сдано", () => {
    const r = gradeAttempt(qs, { "1": [11], "2": [22, 21] }, 80);
    expect(r).toMatchObject({ correctCount: 2, total: 2, score: 100, passed: true });
  });

  it("игнорирует чужие id, дубли и мусор", () => {
    const r = gradeAttempt(qs, { "1": [11, 11, 999], "2": "x" as unknown as number[] }, 50);
    expect(r.details[0].correct).toBe(true);
    expect(r.details[0].options.filter((o) => o.chosen)).toHaveLength(1);
    expect(r.details[1].correct).toBe(false);
  });

  it("пустой тест не считается сданным", () => {
    expect(gradeAttempt([], {}, 0).passed).toBe(false);
  });
});

describe("plural", () => {
  it.each([
    [1, "вопрос"], [2, "вопроса"], [5, "вопросов"], [11, "вопросов"], [21, "вопрос"], [22, "вопроса"], [112, "вопросов"],
  ])("%i %s", (n, w) => expect(plural(n, "вопрос", "вопроса", "вопросов")).toBe(w));
});
