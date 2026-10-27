/**
 * Тесты для сотрудников (раздел /academy, поддомен test.kosmetichka-opt.ru).
 *
 * Правильные ответы никогда не уходят в браузер до сдачи: страница теста получает
 * вопросы без isCorrect, проверка — только на сервере (gradeAttempt).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveImageUrl } from "@/lib/image";

/** Первая картинка каждого товара (уменьшенная копия). Нет товара или фото — нет и ключа. */
export async function productImages(ids: (number | null | undefined)[]): Promise<Map<number, string>> {
  const uniq = [...new Set(ids.filter((id): id is number => typeof id === "number"))];
  if (!uniq.length) return new Map();
  const rows = await prisma.productImage.findMany({
    where: { productId: { in: uniq } },
    orderBy: { id: "asc" },
    select: { productId: true, path: true },
  });
  const out = new Map<number, string>();
  for (const r of rows) {
    if (out.has(r.productId)) continue;
    const url = resolveImageUrl(r.path, 480);
    if (url) out.set(r.productId, url);
  }
  return out;
}

// ── Подписанный момент начала (время прохождения нельзя подделать с клиента) ──

function startSecret() {
  return `academy-start:${process.env.JWT_SECRET ?? "dev-secret-kosmetichka-change-in-production"}`;
}

export function signStart(testId: number, userId: number, startedAt: number) {
  const body = `${testId}.${userId}.${startedAt}`;
  return `${startedAt}.${createHmac("sha256", startSecret()).update(body).digest("hex")}`;
}

/** Возвращает момент начала из подписи или null, если подпись чужая/поддельная. */
export function readStart(token: unknown, testId: number, userId: number): number | null {
  if (typeof token !== "string") return null;
  const [ts, sig] = token.split(".");
  const startedAt = Number(ts);
  if (!Number.isSafeInteger(startedAt) || !sig) return null;
  const expected = signStart(testId, userId, startedAt).split(".")[1];
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? startedAt : null;
}

/** Запас на сеть и автоотправку по таймеру. */
export const TIME_GRACE_MS = 60_000;

/** Кто видит результаты всех сотрудников. */
export const RESULTS_ROLES = ["admin", "manager", "hr"];

/** Кто редактирует сотрудников «только тесты» (раздел /academy/staff). */
export const STAFF_EDIT_ROLES = ["admin", "hr"];

/** HR: только результаты и сотрудники — сами тесты не проходит. */
export const HR_ROLE = "hr";

export const ROLE_NAMES: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  picker: "Сборщик",
  employee: "Сотрудник",
  hr: "HR",
};

/** Роль самостоятельно зарегистрированных: доступ только к тестам (всё остальное пускает лишь admin/manager/picker). */
export const EMPLOYEE_ROLE = "employee";

export type StaffSession = { id: number; login: string; role: string };

/** Любой сотрудник (таблица User) с действующим admin_token. */
export async function getStaff(): Promise<StaffSession | null> {
  const token = (await cookies()).get("admin_token")?.value;
  if (!token) return null;
  const p = await verifyToken(token);
  if (!p || typeof p.id !== "number" || typeof p.role !== "string") return null;
  return { id: p.id, login: String(p.email ?? ""), role: p.role };
}

export function canSeeResults(role: string) {
  return RESULTS_ROLES.includes(role);
}

export function canEditStaff(role: string) {
  return STAFF_EDIT_ROLES.includes(role);
}

/**
 * Право редактировать сотрудников — по роли из БАЗЫ, а не из токена: токен живёт 30 дней,
 * и снятая администратором роль HR не должна продолжать действовать.
 */
export async function requireStaffEditor(): Promise<StaffSession | null> {
  const s = await getStaff();
  if (!s) return null;
  const u = await prisma.user.findUnique({ where: { id: s.id }, select: { role: true, login: true } });
  if (!u || !canEditStaff(u.role)) return null;
  return { id: s.id, login: u.login, role: u.role };
}

// ── Проверка ответов ───────────────────────────────────────────────────────

export type GradeOption = { id: number; text: string; isCorrect: boolean };
export type GradeQuestion = { id: number; text: string; explanation?: string | null; options: GradeOption[] };

/** Ответы сотрудника: id вопроса → id выбранных вариантов. */
export type AnswerMap = Record<string, number[]>;

export type AttemptDetail = {
  questionId: number;
  text: string;
  image?: string | null;
  explanation: string | null;
  correct: boolean;
  options: { id: number; text: string; isCorrect: boolean; chosen: boolean }[];
};

export type GradeResult = {
  correctCount: number;
  total: number;
  score: number; // 0..100
  passed: boolean;
  details: AttemptDetail[];
};

/** Вопрос засчитан, только если выбран ровно набор правильных вариантов. */
export function gradeAttempt(questions: GradeQuestion[], answers: AnswerMap, passScore: number): GradeResult {
  const details: AttemptDetail[] = questions.map((q) => {
    const valid = new Set(q.options.map((o) => o.id));
    const raw = Array.isArray(answers[String(q.id)]) ? answers[String(q.id)] : [];
    const chosen = new Set(raw.filter((id) => Number.isInteger(id) && valid.has(id)));
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
    const correct =
      correctIds.length > 0 && chosen.size === correctIds.length && correctIds.every((id) => chosen.has(id));
    return {
      questionId: q.id,
      text: q.text,
      explanation: q.explanation ?? null,
      correct,
      options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, chosen: chosen.has(o.id) })),
    };
  });
  const total = details.length;
  const correctCount = details.filter((d) => d.correct).length;
  const score = total ? Math.round((correctCount / total) * 100) : 0;
  // «Сдал» — по точной доле, без округления: 39 из 49 (79,6%) при пороге 80% не сдано
  return { correctCount, total, score, passed: total > 0 && correctCount * 100 >= passScore * total, details };
}

export { plural, formatDuration } from "@/lib/academy-format";
