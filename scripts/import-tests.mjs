/**
 * Загрузка тестов для сотрудников из JSON (формат — academy/tests/README.md).
 *
 *   node scripts/import-tests.mjs                 — все academy/tests/*.json
 *   node scripts/import-tests.mjs file.json …     — только указанные
 *   node scripts/import-tests.mjs --check         — только проверить файлы, базу не трогать
 *
 * Тест ищется по slug: новый — создаётся, существующий — обновляется, его вопросы заменяются
 * целиком. Уже сохранённые попытки сотрудников не теряются (в них хранится снимок вопросов).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Проверяет и нормализует тест. Бросает Error с понятным текстом. */
export function normalizeTest(raw, file = "файл") {
  const fail = (msg) => {
    throw new Error(`${file}: ${msg}`);
  };
  if (!raw || typeof raw !== "object") fail("ожидается объект теста");
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  const slug = str(raw.slug);
  if (!SLUG_RE.test(slug)) fail(`slug «${raw.slug ?? ""}» — только латиница, цифры и дефис (например "kassa-basics")`);
  const title = str(raw.title);
  if (!title) fail("нет title");

  const passScore = raw.passScore ?? 80;
  if (!Number.isInteger(passScore) || passScore < 1 || passScore > 100) fail("passScore — целое от 1 до 100");
  const timeLimitMin = raw.timeLimitMin ?? null;
  if (timeLimitMin !== null && (!Number.isInteger(timeLimitMin) || timeLimitMin < 1)) fail("timeLimitMin — целое число минут или null");

  if (!Array.isArray(raw.questions) || raw.questions.length === 0) fail("нет вопросов (questions)");

  const questions = raw.questions.map((q, qi) => {
    const where = `вопрос ${qi + 1}`;
    const text = str(q?.text);
    if (!text) fail(`${where}: нет текста`);
    if (!Array.isArray(q.options) || q.options.length < 2) fail(`${where}: нужно минимум 2 варианта ответа`);

    // Два способа отметить верные: { text, correct: true } или строки + "correct": номер / [номера] (с 1)
    const marks = q.correct === undefined ? null : Array.isArray(q.correct) ? q.correct : [q.correct];
    if (marks && !marks.every((n) => Number.isInteger(n) && n >= 1 && n <= q.options.length)) {
      fail(`${where}: "correct" — номер(а) вариантов от 1 до ${q.options.length}`);
    }
    const options = q.options.map((o, oi) => {
      const otext = typeof o === "string" ? o.trim() : str(o?.text);
      if (!otext) fail(`${where}, вариант ${oi + 1}: пустой текст`);
      const isCorrect = marks ? marks.includes(oi + 1) : o?.correct === true;
      return { order: oi, text: otext, isCorrect };
    });
    if (!options.some((o) => o.isCorrect)) fail(`${where}: не отмечен ни один правильный ответ`);
    if (new Set(options.map((o) => o.text.toLowerCase())).size !== options.length) fail(`${where}: повторяются варианты`);

    const productId = q.productId ?? null;
    if (productId !== null && (!Number.isInteger(productId) || productId < 1)) fail(`${where}: productId — номер товара из каталога`);

    return { order: qi, text, explanation: str(q.explanation) || null, productId, options };
  });

  return {
    slug,
    title,
    description: str(raw.description) || null,
    passScore,
    timeLimitMin,
    showAnswers: raw.showAnswers ?? true,
    shuffle: raw.shuffle ?? true,
    isPublished: raw.isPublished ?? true,
    sortOrder: Number.isInteger(raw.sortOrder) ? raw.sortOrder : 0,
    questions,
  };
}

function loadFiles(args) {
  const dir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "academy", "tests");
  const files = args.length
    ? args
    : readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => join(dir, f));
  const tests = files.map((f) => {
    let raw;
    try {
      raw = JSON.parse(readFileSync(f, "utf8"));
    } catch (e) {
      throw new Error(`${basename(f)}: не читается как JSON — ${e.message}`);
    }
    return normalizeTest(raw, basename(f));
  });
  const slugs = tests.map((t) => t.slug);
  const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
  if (dup) throw new Error(`slug «${dup}» встречается в нескольких файлах`);
  return tests;
}

async function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const tests = loadFiles(argv.filter((a) => !a.startsWith("--")));

  for (const t of tests) {
    const n = t.questions.length;
    console.log(`✓ ${t.slug}: «${t.title}», вопросов: ${n}${t.isPublished ? "" : " (скрыт)"}`);
  }
  if (check) return console.log(`Проверено файлов: ${tests.length}. База не менялась (--check).`);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    for (const { questions, ...data } of tests) {
      await prisma.$transaction(async (tx) => {
        const test = await tx.academyTest.upsert({ where: { slug: data.slug }, create: data, update: data });
        await tx.academyQuestion.deleteMany({ where: { testId: test.id } });
        for (const { options, ...q } of questions) {
          await tx.academyQuestion.create({ data: { ...q, testId: test.id, options: { create: options } } });
        }
      });
    }
    console.log(`Загружено тестов: ${tests.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error("Ошибка:", e.message);
    process.exit(1);
  });
}
