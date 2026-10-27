/** Проверка данных самостоятельной регистрации сотрудника (без серверных зависимостей). */

export const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const PASSWORD_MIN = 8;

export type RegisterInput = { name: string; login: string; password: string };

export type RegisterCheck = { ok: true; data: RegisterInput } | { ok: false; error: string; field: keyof RegisterInput };

export function checkRegistration(raw: unknown): RegisterCheck {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  const login = typeof b.login === "string" ? b.login.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";

  if (name.length < 5 || name.split(" ").length < 2) {
    return { ok: false, field: "name", error: "Укажите фамилию и имя" };
  }
  if (name.length > 80) return { ok: false, field: "name", error: "Слишком длинное имя" };
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

  return { ok: true, data: { name, login, password } };
}
