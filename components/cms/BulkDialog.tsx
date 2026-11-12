"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { cmsApi } from "@/lib/cms/client";
import { SEO_VARS, DEFAULT_TEMPLATES } from "@/lib/cms/seoTemplate";
import { Btn, Field, Input, Select, Textarea } from "@/components/cms/ui";
import { CategorySelect } from "@/components/cms/Pickers";

export type BulkTarget = { ids: number[] } | { filter: string; count: number };
type ActionType = "category" | "brand" | "visibility" | "label" | "seo" | "description";
type Preview = {
  total: number;
  changed: number;
  skipped: { reason: string; count: number }[];
  examples: { id: number; name: string; field: string; before: string; after: string }[];
  warnings: string[];
};

let brandCache: Promise<{ guid: string; name: string; count: number }[]> | null = null;
export function useBrands() {
  const [brands, setBrands] = useState<{ guid: string; name: string; count: number }[]>([]);
  useEffect(() => {
    brandCache ??= cmsApi<{ brands: { guid: string; name: string; count: number }[] }>("/api/cms/brands").then((r) => r.brands);
    brandCache.then(setBrands).catch(() => {});
  }, []);
  return brands;
}

export const VarsHint = () => (
  <div className="text-xs text-neutral-500">
    Переменные:{" "}
    {Object.entries(SEO_VARS).map(([k, v]) => (
      <span key={k} className="mr-2 whitespace-nowrap">
        <code className="rounded bg-neutral-100 px-1">{`{${k}}`}</code> {v.toLowerCase()}
      </span>
    ))}
    . Часть в [квадратных скобках] пропадёт, если переменная в ней пустая.
  </div>
);

/**
 * Bulk change of the chosen products: pick an operation → «Предпросмотр» (how many change, examples,
 * warnings) → «Применить». Every operation can be undone from «История операций».
 */
export function BulkDialog({ target, initial, onClose, onDone }: { target: BulkTarget; initial?: ActionType; onClose: () => void; onDone: () => void }) {
  const brands = useBrands();
  const [type, setType] = useState<ActionType>(initial ?? "visibility");
  const [categoryGuid, setCategoryGuid] = useState("");
  const [brandGuid, setBrandGuid] = useState("");
  const [hidden, setHidden] = useState(true);
  const [label, setLabel] = useState<"new" | "hit">("new");
  const [add, setAdd] = useState(true);
  const [titleTpl, setTitleTpl] = useState(DEFAULT_TEMPLATES.title);
  const [descTpl, setDescTpl] = useState(DEFAULT_TEMPLATES.description);
  const [overwrite, setOverwrite] = useState<"empty" | "template" | "all">("template");
  const [field, setField] = useState<"shortDescription" | "description">("shortDescription");
  const [textTpl, setTextTpl] = useState(DEFAULT_TEMPLATES.shortDescription);
  const [textOverwrite, setTextOverwrite] = useState<"empty" | "all">("empty");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "apply">("");
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    cmsApi<{ templates: typeof DEFAULT_TEMPLATES }>("/api/cms/settings/seo")
      .then((r) => {
        setTitleTpl(r.templates.title);
        setDescTpl(r.templates.description);
        setTextTpl(r.templates.shortDescription);
      })
      .catch(() => {});
  }, []);

  const action = () => {
    switch (type) {
      case "category":
        return { type, categoryGuid };
      case "brand":
        return { type, brandGuid: brandGuid === "none" ? null : brandGuid };
      case "visibility":
        return { type, hidden };
      case "label":
        return { type, label, add };
      case "seo":
        return { type, titleTemplate: titleTpl, descriptionTemplate: descTpl, overwrite };
      case "description":
        return { type, field, template: textTpl, overwrite: textOverwrite };
    }
  };
  const targetBody = "ids" in target ? { ids: target.ids } : { filter: target.filter };
  const count = "ids" in target ? target.ids.length : target.count;
  const needsValue = (type === "category" && !categoryGuid) || (type === "brand" && !brandGuid);
  const dangerous = (type === "seo" && overwrite === "all") || (type === "description" && textOverwrite === "all");

  // параметры поменялись — старый предпросмотр недействителен
  const reset = () => {
    setPreview(null);
    setConfirmAll(false);
  };

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? "preview" : "apply");
    try {
      const r = await cmsApi<{ preview?: Preview; changed?: number; operationId?: number }>("/api/cms/products/bulk", { body: { ...targetBody, action: action(), dryRun } });
      if (dryRun) setPreview(r.preview ?? null);
      else {
        toast.success(`Готово: изменено ${r.changed}. Отменить можно в «История операций».`);
        onDone();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-black/30" onClick={() => !busy && onClose()}>
      <div className="h-full w-full max-w-2xl overflow-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Массовое изменение: {count.toLocaleString("ru-RU")} товаров</h2>
          <button onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Что сделать">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value as ActionType);
                reset();
              }}
            >
              <option value="visibility">Показать / скрыть на сайте</option>
              <option value="label">Метка «Новинка» / «Хит»</option>
              <option value="category">Изменить категорию</option>
              <option value="brand">Назначить бренд</option>
              <option value="seo">Заполнить SEO по шаблону</option>
              <option value="description">Добавить описание по шаблону</option>
            </Select>
          </Field>

          {type === "visibility" ? (
            <Select value={hidden ? "hide" : "show"} onChange={(e) => (setHidden(e.target.value === "hide"), reset())}>
              <option value="hide">Скрыть с сайта</option>
              <option value="show">Показывать на сайте</option>
            </Select>
          ) : null}

          {type === "label" ? (
            <div className="grid grid-cols-2 gap-2">
              <Select value={add ? "add" : "remove"} onChange={(e) => (setAdd(e.target.value === "add"), reset())}>
                <option value="add">Добавить метку</option>
                <option value="remove">Убрать метку</option>
              </Select>
              <Select value={label} onChange={(e) => (setLabel(e.target.value as "new" | "hit"), reset())}>
                <option value="new">«Новинка»</option>
                <option value="hit">«Хит»</option>
              </Select>
            </div>
          ) : null}

          {type === "category" ? (
            <Field label="Новая категория" hint="Категория станет «изменённой на сайте»: обмен с 1С её больше не меняет. Вернуть из 1С — в карточке товара.">
              <CategorySelect value={categoryGuid} onChange={(v) => (setCategoryGuid(v), reset())} />
            </Field>
          ) : null}

          {type === "brand" ? (
            <Field label="Бренд" hint="Бренд станет «изменённым на сайте»: обмен с 1С его больше не меняет.">
              <Select value={brandGuid} onChange={(e) => (setBrandGuid(e.target.value), reset())}>
                <option value="">Выберите бренд…</option>
                <option value="none">— Без бренда —</option>
                {brands.map((b) => (
                  <option key={b.guid} value={b.guid}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {type === "seo" ? (
            <>
              <Field label="Шаблон SEO Title" hint="Пусто — Title не трогаем. Длиннее 70 символов обрезается по слову.">
                <Input value={titleTpl} onChange={(e) => (setTitleTpl(e.target.value), reset())} maxLength={200} />
              </Field>
              <Field label="Шаблон Meta Description" hint="Пусто — не трогаем. Длиннее 160 символов обрезается по слову.">
                <Textarea rows={3} value={descTpl} onChange={(e) => (setDescTpl(e.target.value), reset())} maxLength={400} />
              </Field>
              <VarsHint />
              <Field label="Каким товарам заполнять">
                <Select value={overwrite} onChange={(e) => (setOverwrite(e.target.value as typeof overwrite), reset())}>
                  <option value="empty">Только где SEO пустое</option>
                  <option value="template">Пустые и заполненные шаблоном раньше (ручные не трогать)</option>
                  <option value="all">Все, включая заполненные вручную</option>
                </Select>
              </Field>
            </>
          ) : null}

          {type === "description" ? (
            <>
              <Field label="Поле">
                <Select value={field} onChange={(e) => (setField(e.target.value as typeof field), reset())}>
                  <option value="shortDescription">Краткое описание</option>
                  <option value="description">Полное описание (после этого 1С его не перезаписывает)</option>
                </Select>
              </Field>
              <Field label="Шаблон текста">
                <Textarea rows={4} value={textTpl} onChange={(e) => (setTextTpl(e.target.value), reset())} maxLength={3000} />
              </Field>
              <VarsHint />
              <Field label="Каким товарам">
                <Select value={textOverwrite} onChange={(e) => (setTextOverwrite(e.target.value as typeof textOverwrite), reset())}>
                  <option value="empty">Только где поле пустое</option>
                  <option value="all">Всем — заменить текущий текст</option>
                </Select>
              </Field>
            </>
          ) : null}
        </div>

        <div className="mt-5 flex gap-2">
          <Btn variant="outline" onClick={() => run(true)} loading={busy === "preview"} disabled={needsValue}>
            Предпросмотр
          </Btn>
        </div>

        {preview ? (
          <div className="mt-5 rounded-xl border border-neutral-200 p-4">
            <div className="text-sm">
              Изменится <b>{preview.changed.toLocaleString("ru-RU")}</b> из {preview.total.toLocaleString("ru-RU")}
              {preview.skipped.length ? (
                <span className="text-neutral-500"> · пропущено: {preview.skipped.map((s) => `${s.reason} — ${s.count}`).join("; ")}</span>
              ) : null}
            </div>
            {preview.warnings.map((w) => (
              <div key={w} className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
              </div>
            ))}
            {preview.examples.length ? (
              <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-neutral-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500">
                    <tr>
                      <th className="px-2 py-1.5">Товар</th>
                      <th className="px-2 py-1.5">Поле</th>
                      <th className="px-2 py-1.5">Было</th>
                      <th className="px-2 py-1.5">Станет</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {preview.examples.map((x, i) => (
                      <tr key={i} className="align-top">
                        <td className="max-w-40 px-2 py-1.5">{x.name}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-neutral-500">{x.field}</td>
                        <td className="max-w-48 px-2 py-1.5 text-neutral-500">{x.before}</td>
                        <td className="max-w-48 px-2 py-1.5">{x.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {dangerous && preview.changed > 0 ? (
              <label className="mt-3 flex items-start gap-2 text-sm text-red-700">
                <input type="checkbox" checked={confirmAll} onChange={(e) => setConfirmAll(e.target.checked)} className="mt-1" />
                Понимаю: текст, заполненный вручную, будет заменён (вернуть можно отменой операции).
              </label>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Btn variant="outline" onClick={onClose}>
                Отмена
              </Btn>
              <Btn onClick={() => run(false)} loading={busy === "apply"} disabled={!preview.changed || (dangerous && !confirmAll)}>
                Применить к {preview.changed.toLocaleString("ru-RU")}
              </Btn>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** «История операций»: массовые изменения с отменой */
export function OperationsDrawer({ onClose, onUndone }: { onClose: () => void; onUndone: () => void }) {
  const [ops, setOps] = useState<{ id: number; summary: string; count: number; userName: string; createdAt: string; undoneAt: string | null; undoneBy: string | null }[] | null>(null);
  const [busy, setBusy] = useState(0);
  const load = () => cmsApi<{ operations: NonNullable<typeof ops> }>("/api/cms/operations").then((r) => setOps(r.operations));
  useEffect(() => {
    load().catch(() => setOps([]));
  }, []);
  const undo = async (id: number) => {
    setBusy(id);
    try {
      const r = await cmsApi<{ restored: number; conflicts: number }>(`/api/cms/operations/${id}`, { body: {} });
      toast.success(`Отменено: возвращено ${r.restored}${r.conflicts ? `, не тронуто ${r.conflicts} (их меняли после операции)` : ""}`);
      await load();
      onUndone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(0);
    }
  };
  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">История массовых операций</h2>
          <button onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        {!ops ? <div className="text-sm text-neutral-500">Загрузка…</div> : ops.length === 0 ? <div className="text-sm text-neutral-500">Операций ещё не было</div> : null}
        <ul className="space-y-2">
          {ops?.map((o) => (
            <li key={o.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
              <div className="font-medium">{o.summary}</div>
              <div className="text-xs text-neutral-500">
                {new Date(o.createdAt).toLocaleString("ru-RU")} · {o.userName}
              </div>
              {o.undoneAt ? (
                <div className="mt-1 text-xs text-amber-700">
                  Отменена {new Date(o.undoneAt).toLocaleString("ru-RU")} ({o.undoneBy})
                </div>
              ) : (
                <Btn className="mt-2" size="sm" variant="outline" loading={busy === o.id} onClick={() => undo(o.id)}>
                  Отменить
                </Btn>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-neutral-500">Отмена возвращает прежние значения только тем товарам, которые после операции не меняли.</p>
      </div>
    </div>
  );
}
