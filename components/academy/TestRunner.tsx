"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, RotateCcw, X, XCircle } from "lucide-react";
import { formatDuration, plural } from "@/lib/academy-format";

export type RunnerQuestion = {
  id: number;
  text: string;
  image: string | null;
  multiple: boolean;
  options: { id: number; text: string }[];
};

type Detail = {
  questionId: number;
  text: string;
  image?: string | null;
  explanation: string | null;
  correct: boolean;
  options: { id: number; text: string; isCorrect: boolean; chosen: boolean }[];
};

type Result = {
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  passScore: number;
  late: boolean;
  elapsedMs: number;
  details: Detail[] | null;
};

type Props = {
  slug: string;
  title: string;
  description: string | null;
  passScore: number;
  timeLimitMin: number | null;
  questions: RunnerQuestion[];
  start: string;
};

export default function TestRunner({ slug, title, description, passScore, timeLimitMin, questions, start }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  // Таймер считаем от момента открытия страницы (часы сервера и телефона могут расходиться)
  const limitMs = timeLimitMin ? timeLimitMin * 60_000 : null;
  const [leftMs, setLeftMs] = useState<number | null>(limitMs);
  useEffect(() => {
    if (limitMs === null) return;
    const begin = Date.now();
    const t = setInterval(() => setLeftMs(limitMs - (Date.now() - begin)), 1000);
    return () => clearInterval(t);
  }, [limitMs]);

  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id]?.length ?? 0) > 0).length,
    [questions, answers],
  );

  const submit = useCallback(async () => {
    if (submitting || result) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/academy/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, start, answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось отправить ответы. Попробуйте ещё раз.");
        return;
      }
      setResult(data as Result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Нет связи с сервером. Ответы сохранены на странице — нажмите «Завершить» ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }, [answers, result, slug, start, submitting]);

  // Время вышло — отправляем то, что успели
  const autoSent = useRef(false);
  useEffect(() => {
    if (leftMs !== null && leftMs <= 0 && !autoSent.current && !result) {
      autoSent.current = true;
      void submit();
    }
  }, [leftMs, result, submit]);

  // Предупреждение при закрытии вкладки посреди теста
  useEffect(() => {
    if (result || answeredCount === 0) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [result, answeredCount]);

  if (result) return <ResultView result={result} title={title} />;

  if (questions.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <p className="font-bold text-slate-700">В этом тесте пока нет вопросов.</p>
        <Link href="/academy" className="mt-4 inline-block font-bold text-pink-500">
          ← К списку тестов
        </Link>
      </div>
    );
  }

  const q = questions[index];
  const chosen = answers[q.id] ?? [];
  const isLast = index === questions.length - 1;
  const unanswered = questions.length - answeredCount;

  function toggle(optionId: number) {
    setAnswers((prev) => {
      const cur = prev[q.id] ?? [];
      const next = q.multiple
        ? cur.includes(optionId)
          ? cur.filter((id) => id !== optionId)
          : [...cur, optionId]
        : [optionId];
      return { ...prev, [q.id]: next };
    });
  }

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/academy" className="text-sm font-bold text-slate-500 hover:text-pink-500">
            ← Все тесты
          </Link>
          <h1 className="mt-1 text-2xl font-black text-slate-900">{title}</h1>
          {description && index === 0 && answeredCount === 0 && (
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>
          )}
          <p className="mt-1 text-xs font-bold text-slate-500">Проходной балл — {passScore}%</p>
        </div>
        {leftMs !== null && (
          <div
            className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-black tabular-nums ${
              leftMs < 60_000 ? "bg-rose-50 text-rose-600" : "bg-white text-slate-700 border border-slate-200"
            }`}
            aria-live="polite"
          >
            <Clock className="h-4 w-4" />
            {clock(leftMs)}
          </div>
        )}
      </div>

      {/* Навигация по вопросам */}
      <div className="flex flex-wrap gap-1.5" aria-label="Вопросы">
        {questions.map((qq, i) => {
          const done = (answers[qq.id]?.length ?? 0) > 0;
          return (
            <button
              key={qq.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Вопрос ${i + 1}${done ? ", есть ответ" : ""}`}
              aria-current={i === index ? "step" : undefined}
              className={`h-8 min-w-8 cursor-pointer rounded-xl px-2 text-xs font-black transition ${
                i === index
                  ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white"
                  : done
                    ? "bg-purple-100 text-purple-700"
                    : "border border-slate-200 bg-white text-slate-500"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          Вопрос {index + 1} из {questions.length}
          {q.multiple && <span className="ml-2 normal-case text-purple-600">· несколько правильных ответов</span>}
        </p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
          {q.image && <ProductPhoto key={q.id} src={q.image} className="h-44 w-full sm:h-40 sm:w-40" />}
          <h2 className="whitespace-pre-line text-lg font-bold leading-snug text-slate-900">{q.text}</h2>
        </div>

        <div className="mt-5 space-y-2.5" role={q.multiple ? "group" : "radiogroup"}>
          {q.options.map((o) => {
            const on = chosen.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role={q.multiple ? "checkbox" : "radio"}
                aria-checked={on}
                onClick={() => toggle(o.id)}
                className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  on ? "border-purple-400 bg-purple-50 text-slate-900" : "border-slate-200 bg-white hover:border-pink-200"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
                    q.multiple ? "rounded-md" : "rounded-full"
                  } ${on ? "border-purple-500 bg-purple-500 text-white" : "border-slate-300"}`}
                >
                  {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="whitespace-pre-line">{o.text}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-500">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="inline-flex h-12 cursor-pointer items-center gap-1 rounded-2xl border border-slate-200 bg-white px-4 font-bold text-slate-700 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Назад
        </button>
        {!isLast && (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="inline-flex h-12 cursor-pointer items-center gap-1 rounded-2xl border border-slate-200 bg-white px-4 font-bold text-slate-700"
          >
            Далее <ArrowRight className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (unanswered > 0 && !confirm(`Без ответа ${unanswered} ${plural(unanswered, "вопрос", "вопроса", "вопросов")}. Всё равно завершить?`)) return;
            void submit();
          }}
          disabled={submitting}
          className={`ml-auto h-12 cursor-pointer rounded-2xl px-6 font-black text-white disabled:opacity-60 ${
            isLast || unanswered === 0
              ? "bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700"
              : "bg-slate-400"
          }`}
        >
          {submitting ? "Проверяем…" : "Завершить тест"}
        </button>
      </div>
      <p className="text-xs font-semibold text-slate-500">
        Отвечено {answeredCount} из {questions.length}
      </p>
    </div>
  );
}

function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ResultView({ result, title }: { result: Result; title: string }) {
  const { passed } = result;
  return (
    <div className="space-y-6 pt-4">
      <section
        className={`rounded-3xl border p-6 text-center sm:p-8 ${
          passed ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
        }`}
      >
        {passed ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        ) : (
          <XCircle className="mx-auto h-12 w-12 text-rose-500" />
        )}
        <p className="mt-3 text-sm font-bold text-slate-600">{title}</p>
        <p className={`mt-1 text-5xl font-black tabular-nums ${passed ? "text-emerald-600" : "text-rose-600"}`}>
          {result.score}%
        </p>
        <p className="mt-2 text-lg font-black text-slate-900">{passed ? "Тест сдан" : "Тест не сдан"}</p>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          Правильно {result.correctCount} из {result.total} · нужно {result.passScore}% · время{" "}
          {formatDuration(result.elapsedMs)}
        </p>
        {result.late && (
          <p className="mt-2 text-sm font-bold text-rose-600">Время на тест истекло — ответы не засчитаны.</p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 font-bold text-slate-700"
          >
            <RotateCcw className="h-4 w-4" /> Пройти ещё раз
          </button>
          <Link
            href="/academy"
            className="inline-flex h-11 items-center rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-700 px-5 font-black text-white"
          >
            К списку тестов
          </Link>
        </div>
      </section>

      {result.details && <Review details={result.details} />}
    </div>
  );
}

export function Review({ details }: { details: Detail[] }) {
  const wrong = details.filter((d) => !d.correct).length;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-black text-slate-900">
        Разбор {wrong > 0 ? `· ошибок: ${wrong}` : "· без ошибок"}
      </h2>
      {details.map((d, i) => (
        <article
          key={d.questionId}
          className={`rounded-3xl border bg-white p-5 ${d.correct ? "border-slate-200" : "border-rose-200"}`}
        >
          <div className="flex items-start gap-3">
          {d.image && <ProductPhoto src={d.image} className="h-16 w-16 shrink-0" />}
          <p className="flex items-start gap-2 font-bold text-slate-900">
            {d.correct ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-label="Верно" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-label="Неверно" />
            )}
            <span className="whitespace-pre-line">
              {i + 1}. {d.text}
            </span>
          </p>
          </div>
          <ul className="mt-3 space-y-1.5 pl-7 text-sm">
            {d.options.map((o) => (
              <li
                key={o.id}
                className={`flex items-start gap-2 rounded-xl px-3 py-1.5 ${
                  o.isCorrect ? "bg-emerald-50 font-bold text-emerald-800" : o.chosen ? "bg-rose-50 text-rose-700" : "text-slate-600"
                }`}
              >
                {o.isCorrect ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                ) : o.chosen ? (
                  <X className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className="whitespace-pre-line">
                  {o.text}
                  {o.chosen && <span className="ml-1 text-xs font-bold opacity-70">(ваш ответ)</span>}
                </span>
              </li>
            ))}
          </ul>
          {d.explanation && (
            <p className="mt-3 whitespace-pre-line rounded-2xl bg-slate-50 p-3 pl-4 text-sm text-slate-600">
              {d.explanation}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

/** Фото товара из каталога; если файл не загрузился — блок просто исчезает. */
function ProductPhoto({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-white p-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(true)} />
    </div>
  );
}
