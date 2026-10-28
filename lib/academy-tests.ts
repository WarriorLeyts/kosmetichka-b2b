/** Проверка теста из редактора HR (без серверных зависимостей — покрыта тестами). */

export const LIMITS = {
  titleMax: 120,
  descriptionMax: 1000,
  questionsMax: 200,
  questionMax: 1000,
  optionsMin: 2,
  optionsMax: 8,
  optionMax: 300,
  timeLimitMax: 300,
};

export type DraftOption = { text: string; isCorrect: boolean };
export type DraftQuestion = { productId: number | null; text: string; explanation: string | null; options: DraftOption[] };
export type TestDraft = {
  title: string;
  description: string | null;
  passScore: number;
  timeLimitMin: number | null;
  isPublished: boolean;
  questions: DraftQuestion[];
};

export type DraftCheck = { ok: true; data: TestDraft } | { ok: false; error: string; question?: number };

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "");

export function checkTestDraft(raw: unknown): DraftCheck {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = str(b.title).replace(/\s+/g, " ");
  if (title.length < 3) return { ok: false, error: "Укажите название теста" };
  if (title.length > LIMITS.titleMax) return { ok: false, error: "Слишком длинное название" };

  const description = str(b.description) || null;
  if (description && description.length > LIMITS.descriptionMax) return { ok: false, error: "Слишком длинное описание" };

  const passScore = Number(b.passScore);
  if (!Number.isInteger(passScore) || passScore < 1 || passScore > 100) {
    return { ok: false, error: "Проходной балл — целое число от 1 до 100 %" };
  }

  const tl = b.timeLimitMin;
  const timeLimitMin = tl === null || tl === undefined || tl === "" ? null : Number(tl);
  if (timeLimitMin !== null && (!Number.isInteger(timeLimitMin) || timeLimitMin < 1 || timeLimitMin > LIMITS.timeLimitMax)) {
    return { ok: false, error: `Время на тест — от 1 до ${LIMITS.timeLimitMax} минут или без ограничения` };
  }

  const qs = Array.isArray(b.questions) ? b.questions : [];
  if (!qs.length) return { ok: false, error: "Добавьте хотя бы один вопрос" };
  if (qs.length > LIMITS.questionsMax) return { ok: false, error: `Не больше ${LIMITS.questionsMax} вопросов` };

  const questions: DraftQuestion[] = [];
  for (let i = 0; i < qs.length; i++) {
    const n = i + 1;
    const q = (qs[i] && typeof qs[i] === "object" ? qs[i] : {}) as Record<string, unknown>;
    const text = str(q.text);
    if (text.length < 3) return { ok: false, error: `Вопрос ${n}: напишите текст вопроса`, question: i };
    if (text.length > LIMITS.questionMax) return { ok: false, error: `Вопрос ${n}: слишком длинный текст`, question: i };

    const explanation = str(q.explanation) || null;
    if (explanation && explanation.length > LIMITS.questionMax) return { ok: false, error: `Вопрос ${n}: слишком длинное пояснение`, question: i };

    const pid = q.productId;
    const productId = pid === null || pid === undefined || pid === "" ? null : Number(pid);
    if (productId !== null && (!Number.isInteger(productId) || productId < 1)) {
      return { ok: false, error: `Вопрос ${n}: неверный товар`, question: i };
    }

    const rawOpts = Array.isArray(q.options) ? q.options : [];
    const options: DraftOption[] = rawOpts
      .map((o) => (o && typeof o === "object" ? (o as Record<string, unknown>) : {}))
      .map((o) => ({ text: str(o.text).replace(/\s+/g, " "), isCorrect: o.isCorrect === true }))
      .filter((o) => o.text); // пустые строки вариантов просто не сохраняем
    if (options.length < LIMITS.optionsMin) return { ok: false, error: `Вопрос ${n}: нужно минимум ${LIMITS.optionsMin} варианта ответа`, question: i };
    if (options.length > LIMITS.optionsMax) return { ok: false, error: `Вопрос ${n}: не больше ${LIMITS.optionsMax} вариантов`, question: i };
    if (options.some((o) => o.text.length > LIMITS.optionMax)) return { ok: false, error: `Вопрос ${n}: слишком длинный вариант ответа`, question: i };
    if (!options.some((o) => o.isCorrect)) return { ok: false, error: `Вопрос ${n}: отметьте правильный ответ`, question: i };
    if (options.every((o) => o.isCorrect)) return { ok: false, error: `Вопрос ${n}: все варианты отмечены правильными`, question: i };
    if (new Set(options.map((o) => o.text.toLowerCase())).size !== options.length) {
      return { ok: false, error: `Вопрос ${n}: варианты ответа повторяются`, question: i };
    }
    questions.push({ productId, text, explanation, options });
  }

  return { ok: true, data: { title, description, passScore, timeLimitMin, isPublished: b.isPublished !== false, questions } };
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Адрес теста из названия: «Уход за волосами» → «uhod-za-volosami». */
export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .split("")
    .map((c) => TRANSLIT[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s.length >= 2 ? s : "test";
}

/** Код из поля поиска: пробелы убраны, буквы заглавные («цб000012380 » → «ЦБ000012380»). */
export function normalizeCode(code: string) {
  return code.replace(/\s+/g, "").toUpperCase();
}
