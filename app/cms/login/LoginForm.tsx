"use client";
import { useState } from "react";
import { Btn, Field, Input } from "@/components/cms/ui";

export function LoginForm() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не удалось войти");
      if (data.role !== "admin" && data.role !== "manager") {
        await fetch("/api/cms/logout", { method: "POST" });
        throw new Error("У этой учётной записи нет доступа к админ-панели");
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Логин">
        <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus required />
      </Field>
      <Field label="Пароль">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </Field>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Btn type="submit" className="w-full" loading={busy}>
        Войти
      </Btn>
    </form>
  );
}
