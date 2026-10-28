"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, ImageOff, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { plural } from "@/lib/academy-format";
import { ProductPhoto } from "./TestRunner";

export type EditorProduct = { id: number; name: string; article: string | null; barcode: string | null; image: string | null };
export type EditorQuestion = {
  product: EditorProduct | null;
  text: string;
  explanation: string;
  options: { text: string; isCorrect: boolean }[];
};
export type EditorTest = {
  id: number | null;
  slug: string | null;
  title: string;
  description: string;
  passScore: number;
  timeLimitMin: number | null;
  isPublished: boolean;
  attempts: number;
  questions: EditorQuestion[];
};

type Q = Omit<EditorQuestion, "options"> & { key: string; options: { key: string; text: string; isCorrect: boolean }[] };

let seq = 0;
const nextKey = () => `k${++seq}`;
const withKeys = (q: EditorQuestion): Q => ({ ...q, key: nextKey(), options: q.options.map((o) => ({ ...o, key: nextKey() })) });
const emptyQuestion = (): Q =>
  withKeys({ product: null, text: "", explanation: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }, { text: "", isCorrect: false }] });

const input =
  "h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-pink-300";
const area =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-pink-300";

export default function TestEditor({ initial }: { initial: EditorTest }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [passScore, setPassScore] = useState(String(initial.passScore));
  const [timeLimit, setTimeLimit] = useState(initial.timeLimitMin ? String(initial.timeLimitMin) : "");
  const [isPublished, setIsPublished] = useState(initial.isPublished);
  const [questions, setQuestions] = useState<Q[]>(() =>
    initial.questions.length ? initial.questions.map(withKeys) : [emptyQuestion()],
  );
  const [error, setError] = useState<{ text: string; question?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);

  // Не потерять работу случайным закрытием вкладки
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const touch = () => {
    dirty.current = true;
    setSaved(false);
    setError(null);
  };
  const updateQ = (i: number, patch: Partial<Q>) => {
    touch();
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  };
  const move = (i: number, d: -1 | 1) => {
    touch();
    setQuestions((qs) => {
      const a = [...qs];
      [a[i], a[i + d]] = [a[i + d], a[i]];
      return a;
    });
  };

  async function save() {
    setSaving(true);
    setError(null);
    const body = {
      title,
      description,
      passScore: Number(passScore),
      timeLimitMin: timeLimit.trim() === "" ? null : Number(timeLimit),
      isPublished,
      questions: questions.map((q) => ({
        productId: q.product?.id ?? null,
        text: q.text,
        explanation: q.explanation,
        options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
      })),
    };
    try {
      const res = await fetch(initial.id ? `/api/academy/tests/${initial.id}` : "/api/academy/tests", {
        method: initial.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ text: data.error || "Не удалось сохранить", question: data.question });
        if (typeof data.question === "number") {
          document.getElementById(`q-${data.question}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }
      dirty.current = false;
      if (!initial.id) {
        router.replace(`/academy/manage/${data.id}?created=1`);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError({ text: "Нет связи с сайтом. Попробуйте ещё раз." });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial.id || !window.confirm(`Удалить тест «${initial.title}»? Это нельзя отменить.`)) return;
    const res = await fetch(`/api/academy/tests/${initial.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError({ text: data.error || "Не удалось удалить" });
      return;
    }
    dirty.current = false;
    router.replace("/academy/manage?deleted=1");
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-500">Название теста</span>
          <input
            value={title}
            onChange={(e) => (touch(), setTitle(e.target.value))}
            maxLength={120}
            placeholder="Например: Уход за волосами"
            className={input}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-500">Описание (необязательно) — сотрудник видит перед началом</span>
          <textarea
            value={description}
            onChange={(e) => (touch(), setDescription(e.target.value))}
            rows={2}
            maxLength={1000}
            className={area}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">Проходной балл, %</span>
            <input
              type="number"
              min={1}
              max={100}
              value={passScore}
              onChange={(e) => (touch(), setPassScore(e.target.value))}
              className={input}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">Время, минут (пусто — без лимита)</span>
            <input
              type="number"
              min={1}
              max={300}
              value={timeLimit}
              onChange={(e) => (touch(), setTimeLimit(e.target.value))}
              placeholder="без лимита"
              className={input}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 self-end rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => (touch(), setIsPublished(e.target.checked))}
              className="h-5 w-5 accent-pink-500"
            />
            <span className="text-sm font-bold text-slate-700">Опубликован — виден сотрудникам</span>
          </label>
        </div>
        {initial.attempts > 0 && (
          <p className="rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            Тест уже проходили ({initial.attempts}). Изменения коснутся только новых прохождений — старые результаты
            сохраняются такими, какими были.
          </p>
        )}
      </section>

      {questions.map((q, i) => (
        <QuestionCard
          key={q.key}
          index={i}
          q={q}
          count={questions.length}
          highlighted={error?.question === i}
          onChange={(patch) => updateQ(i, patch)}
          onMove={(d) => move(i, d)}
          onRemove={() => {
            touch();
            setQuestions((qs) => qs.filter((_, j) => j !== i));
          }}
        />
      ))}

      <button
        type="button"
        onClick={() => {
          touch();
          setQuestions((qs) => [...qs, emptyQuestion()]);
        }}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-300 bg-white py-4 text-sm font-black text-slate-600 hover:border-pink-300 hover:text-pink-500"
      >
        <Plus className="h-5 w-5" /> Добавить вопрос
      </button>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-500 px-6 text-sm font-black text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {initial.id ? "Сохранить" : "Создать тест"}
        </button>
        <span className="text-xs font-bold text-slate-500">
          {questions.length} {plural(questions.length, "вопрос", "вопроса", "вопросов")}
        </span>
        {saved && <span className="text-sm font-bold text-emerald-600">Сохранено</span>}
        {error && <span className="text-sm font-bold text-red-500">{error.text}</span>}
        {initial.id && initial.attempts === 0 && (
          <button
            type="button"
            onClick={remove}
            className="ml-auto inline-flex cursor-pointer items-center gap-1 text-sm font-bold text-slate-400 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" /> Удалить тест
          </button>
        )}
      </div>
    </div>
  );
}

function QuestionCard({
  index,
  q,
  count,
  highlighted,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  q: Q;
  count: number;
  highlighted: boolean;
  onChange: (patch: Partial<Q>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const multiple = q.options.filter((o) => o.isCorrect).length > 1;
  const setOption = (j: number, patch: Partial<Q["options"][number]>) =>
    onChange({ options: q.options.map((o, k) => (k === j ? { ...o, ...patch } : o)) });

  return (
    <section
      id={`q-${index}`}
      className={`space-y-4 rounded-3xl border bg-white p-5 sm:p-6 ${highlighted ? "border-red-300 ring-2 ring-red-100" : "border-slate-200"}`}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-base font-black text-slate-900">Вопрос {index + 1}</h2>
        <div className="ml-auto flex items-center gap-1 text-slate-400">
          <IconButton label="Выше" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-4 w-4" />
          </IconButton>
          <IconButton label="Ниже" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Удалить вопрос"
            disabled={count === 1}
            onClick={() => (q.text.trim() === "" || window.confirm(`Удалить вопрос ${index + 1}?`)) && onRemove()}
            danger
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <ProductPicker
        product={q.product}
        onPick={(p) => onChange({ product: p, ...(p && !q.text.trim() ? { text: `${p.name}\n` } : {}) })}
      />

      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-500">Текст вопроса</span>
        <textarea
          value={q.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={3}
          maxLength={1000}
          placeholder="Для чего подходит этот крем?"
          className={area}
        />
      </label>

      <div className="space-y-2">
        <span className="block text-xs font-bold text-slate-500">
          Варианты ответа — галочкой отметьте правильный{multiple ? " (отмечено несколько — сотрудник увидит «несколько правильных»)" : ""}
        </span>
        {q.options.map((o, j) => (
          <div key={o.key} className="flex items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={o.isCorrect}
              aria-label={o.isCorrect ? "Правильный ответ" : "Отметить правильным"}
              title={o.isCorrect ? "Правильный ответ" : "Отметить правильным"}
              onClick={() => setOption(j, { isCorrect: !o.isCorrect })}
              className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border-2 transition ${
                o.isCorrect ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 bg-white text-transparent hover:border-emerald-300"
              }`}
            >
              <Check className="h-5 w-5" />
            </button>
            <input
              value={o.text}
              onChange={(e) => setOption(j, { text: e.target.value })}
              maxLength={300}
              placeholder={`Вариант ${j + 1}`}
              className={`${input} ${o.isCorrect ? "border-emerald-200 bg-emerald-50" : ""}`}
            />
            <IconButton
              label="Убрать вариант"
              disabled={q.options.length <= 2}
              onClick={() => onChange({ options: q.options.filter((_, k) => k !== j) })}
              danger
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
        {q.options.length < 8 && (
          <button
            type="button"
            onClick={() => onChange({ options: [...q.options, { key: nextKey(), text: "", isCorrect: false }] })}
            className="inline-flex cursor-pointer items-center gap-1 pl-1 text-sm font-bold text-pink-500 hover:text-pink-600"
          >
            <Plus className="h-4 w-4" /> вариант
          </button>
        )}
      </div>

      <details open={q.explanation !== ""} className="group">
        <summary className="cursor-pointer text-xs font-bold text-slate-500 hover:text-pink-500">
          Пояснение к ответу (необязательно, видят только HR и администратор в разборе)
        </summary>
        <textarea
          value={q.explanation}
          onChange={(e) => onChange({ explanation: e.target.value })}
          rows={2}
          maxLength={1000}
          className={`${area} mt-2`}
        />
      </details>
    </section>
  );
}

type Lookup = { state: "idle" } | { state: "loading" } | { state: "done"; items: EditorProduct[]; exact: boolean } | { state: "error"; text: string };

/** Товар по коду номенклатуры 1С, штрихкоду или названию — фото подтягивается из каталога. */
function ProductPicker({ product, onPick }: { product: EditorProduct | null; onPick: (p: EditorProduct | null) => void }) {
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });

  async function find() {
    const c = code.trim();
    if (!c) return;
    setLookup({ state: "loading" });
    try {
      const res = await fetch(`/api/academy/products/lookup?code=${encodeURIComponent(c)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.exact && data.items.length === 1) {
        onPick(data.items[0]);
        setCode("");
        setLookup({ state: "idle" });
        return;
      }
      setLookup({ state: "done", items: data.items, exact: data.exact });
    } catch (e) {
      setLookup({ state: "error", text: e instanceof Error && e.message ? e.message : "Не удалось найти" });
    }
  }

  if (product) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 pr-3">
        {product.image ? (
          <ProductPhoto key={product.id} src={product.image} className="h-20 w-20 shrink-0" />
        ) : (
          <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-white text-center text-[10px] font-bold text-slate-400">
            <ImageOff className="mb-1 h-5 w-5" /> нет фото
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold text-slate-900">{product.name}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {product.article && <>Код {product.article}</>}
            {product.barcode && <> · ШК {product.barcode}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="shrink-0 cursor-pointer text-xs font-bold text-slate-400 hover:text-red-500"
        >
          убрать товар
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-3">
      <span className="mb-1.5 block text-xs font-bold text-slate-500">
        Товар (необязательно): код номенклатуры, штрихкод или название — в вопросе появится фото
      </span>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              find();
            }
          }}
          placeholder="ЦБ000012380"
          className={input}
        />
        <button
          type="button"
          onClick={find}
          disabled={lookup.state === "loading" || !code.trim()}
          className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {lookup.state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Найти
        </button>
      </div>
      {lookup.state === "error" && <p className="mt-2 text-sm font-bold text-red-500">{lookup.text}</p>}
      {lookup.state === "done" &&
        (lookup.items.length === 0 ? (
          <p className="mt-2 text-sm font-bold text-slate-500">Ничего не найдено. Проверьте код — например, ЦБ000012380.</p>
        ) : (
          <div className="mt-2 space-y-1">
            {!lookup.exact && <p className="text-xs font-semibold text-slate-500">Точного кода нет — похожие товары:</p>}
            {lookup.items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onPick(p);
                  setCode("");
                  setLookup({ state: "idle" });
                }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-1.5 text-left hover:bg-pink-50"
              >
                {p.image ? (
                  <ProductPhoto key={p.id} src={p.image} className="h-12 w-12 shrink-0 !p-1" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                    <ImageOff className="h-4 w-4 text-slate-300" />
                  </div>
                )}
                <span className="min-w-0">
                  <span className="line-clamp-1 block text-sm font-bold text-slate-800">{p.name}</span>
                  <span className="block text-xs font-semibold text-slate-500">{p.article}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  danger,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent ${
        danger ? "hover:text-red-500" : "hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
