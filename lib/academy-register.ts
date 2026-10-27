/** Проверка данных самостоятельной регистрации сотрудника (без серверных зависимостей). */

export const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const PASSWORD_MIN = 8;

export type RegisterInput = { name: string; position: string; store: string; login: string; password: string };

/** Магазины сети — выбираются из списка при регистрации. Новый магазин — добавить сюда. */
export const STORES = ["Мегакосметичка", "Розовая косметичка", "Парфюм", "Парфюм 2", "Гудермес", "Концепт"];

/** Должность по умолчанию — подставлена в форме, сотрудник может поменять. */
export const DEFAULT_POSITION = "Продавец-консультант";

/** Подсказки в поле «Должность» (можно ввести свою). */
export const POSITION_SUGGESTIONS = [
  "Продавец-консультант",
  "Старший продавец",
  "Кассир",
  "Администратор магазина",
  "Управляющий магазином",
  "Визажист",
  "Менеджер по продажам",
  "Кладовщик",
];

/** Пробелы схлопываем, первую букву — заглавной: «продавец  консультант» → «Продавец консультант». */
function clean(v: unknown) {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  return s ? s[0].toLocaleUpperCase("ru") + s.slice(1) : "";
}

export type RegisterCheck = { ok: true; data: RegisterInput } | { ok: false; error: string; field: keyof RegisterInput };

export function checkRegistration(raw: unknown): RegisterCheck {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  const position = clean(b.position);
  const store = typeof b.store === "string" ? b.store.trim() : "";
  const login = typeof b.login === "string" ? b.login.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";

  if (name.length < 5 || name.split(" ").length < 2) {
    return { ok: false, field: "name", error: "Укажите фамилию и имя" };
  }
  if (name.length > 80) return { ok: false, field: "name", error: "Слишком длинное имя" };
  if (position.length < 2) return { ok: false, field: "position", error: "Укажите должность" };
  if (position.length > 60) return { ok: false, field: "position", error: "Слишком длинное название должности" };
  if (!STORES.includes(store)) return { ok: false, field: "store", error: "Выберите магазин, где вы работаете" };
  if (!LOGIN_RE.test(login)) {
    return {
      ok: false,
      field: "login",
      error: "Логин — от 3 до 32 символов: латинские буквы, цифры, точка, дефис или подчёркивание",
    };
  }
  if (password.length < PASSWORD_MIN) {
    return { ok: false, field: "password", error: `Пароль — не короче ${PASSWORD_MIN} символов` };
  }
  if (password.length > 72) return { ok: false, field: "password", error: "Слишком длинный пароль" };
  if (password.toLowerCase() === login) return { ok: false, field: "password", error: "Пароль не должен совпадать с логином" };

  return { ok: true, data: { name, position, store, login, password } };
}

export type StaffEditInput = { name: string; position: string; store: string; password: string | null };
export type StaffEditCheck = { ok: true; data: StaffEditInput } | { ok: false; error: string };

/** Правка сотрудника HR-ом: те же правила, что при регистрации; пароль — только если задан новый. */
export function checkStaffEdit(raw: { name?: unknown; position?: unknown; store?: unknown; password?: unknown; password2?: unknown }): StaffEditCheck {
  const password = typeof raw.password === "string" ? raw.password : "";
  const base = checkRegistration({ ...raw, login: "placeholder", password: password || "placeholder-ok" });
  if (!base.ok) return { ok: false, error: base.error };
  if (password) {
    if (password !== raw.password2) return { ok: false, error: "Пароли не совпадают" };
    if (password.length < PASSWORD_MIN) return { ok: false, error: `Пароль — не короче ${PASSWORD_MIN} символов` };
    if (password.length > 72) return { ok: false, error: "Слишком длинный пароль" };
  }
  const { name, position, store } = base.data;
  return { ok: true, data: { name, position, store, password: password || null } };
}
