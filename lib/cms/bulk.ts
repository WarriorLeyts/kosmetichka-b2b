import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lengthIssue, renderFit, renderTemplate, SEO_LIMITS, unknownVars, type SeoProduct } from "./seoTemplate";

/**
 * Bulk changes of products (admin panel): the same code computes the preview (what will change, how
 * many, examples, warnings) and applies it; every applied operation keeps the values before it
 * (CmsBulkOperation) — «Отменить» puts them back where nobody changed them since.
 */
export const bulkActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("category"), categoryGuid: z.string().min(1).max(80) }),
  z.object({ type: z.literal("brand"), brandGuid: z.string().min(1).max(80).nullable() }),
  z.object({ type: z.literal("visibility"), hidden: z.boolean() }),
  z.object({ type: z.literal("label"), label: z.enum(["new", "hit"]), add: z.boolean() }),
  z.object({
    type: z.literal("seo"),
    titleTemplate: z.string().trim().max(200),
    descriptionTemplate: z.string().trim().max(400),
    /** empty — only empty fields; template — empty and earlier filled by a template; all — also typed by hand */
    overwrite: z.enum(["empty", "template", "all"]),
  }),
  z.object({
    type: z.literal("description"),
    field: z.enum(["shortDescription", "description"]),
    template: z.string().trim().min(1).max(3000),
    overwrite: z.enum(["empty", "all"]),
  }),
]);
export type BulkAction = z.infer<typeof bulkActionSchema>;

export const ACTION_LABELS: Record<BulkAction["type"], string> = {
  category: "Изменить категорию",
  brand: "Назначить бренд",
  visibility: "Показать / скрыть",
  label: "Метка «Новинка» / «Хит»",
  seo: "SEO по шаблону",
  description: "Описание по шаблону",
};

type Fields = Partial<{
  categoryGuid: string | null;
  categoryManual: boolean;
  brandGuid: string | null;
  brandManual: boolean;
  hidden: boolean;
  labels: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  seoSource: string | null;
  shortDescription: string | null;
  description: string | null;
  descriptionManual: boolean;
}>;
export type Change = { id: number; name: string; before: Fields; after: Fields };

const SELECT = {
  id: true,
  name: true,
  article: true,
  country: true,
  categoryGuid: true,
  categoryManual: true,
  brandGuid: true,
  brandManual: true,
  hidden: true,
  labels: true,
  seoTitle: true,
  seoDescription: true,
  seoSource: true,
  shortDescription: true,
  description: true,
  descriptionManual: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
  prices: { where: { priceType: "retail" }, select: { price: true } },
} satisfies Prisma.ProductSelect;
type Row = Prisma.ProductGetPayload<{ select: typeof SELECT }>;

const vars = (r: Row): SeoProduct => ({
  name: r.name,
  brand: r.brand?.name?.trim() || null,
  category: r.category?.name ?? null,
  article: r.article,
  price: r.prices[0]?.price ?? null,
  country: r.country,
});

export type Preview = {
  total: number;
  changed: number;
  skipped: { reason: string; count: number }[];
  examples: { id: number; name: string; field: string; before: string; after: string }[];
  warnings: string[];
};

/** what the action does to these products (nothing is written) */
export async function computeChanges(ids: number[], action: BulkAction): Promise<{ changes: Change[]; preview: Preview }> {
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += 2000) rows.push(...(await prisma.product.findMany({ where: { id: { in: ids.slice(i, i + 2000) } }, select: SELECT })));
  const changes: Change[] = [];
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const warnings: string[] = [];

  if (action.type === "category" && !(await prisma.category.findUnique({ where: { guid: action.categoryGuid }, select: { guid: true } })))
    throw new Error("Категория не найдена");
  if (action.type === "brand" && action.brandGuid && !(await prisma.brand.findUnique({ where: { guid: action.brandGuid }, select: { guid: true } })))
    throw new Error("Бренд не найден");
  if (action.type === "seo") {
    const bad = [...unknownVars(action.titleTemplate), ...unknownVars(action.descriptionTemplate)];
    if (bad.length) throw new Error(`Неизвестные переменные: ${bad.map((b) => `{${b}}`).join(", ")}`);
  }
  if (action.type === "description" && unknownVars(action.template).length) throw new Error(`Неизвестные переменные: ${unknownVars(action.template).join(", ")}`);

  for (const r of rows) {
    const before: Fields = {};
    const after: Fields = {};
    if (action.type === "category") {
      if (r.categoryGuid === action.categoryGuid) {
        skip("уже в этой категории");
        continue;
      }
      Object.assign(before, { categoryGuid: r.categoryGuid, categoryManual: r.categoryManual });
      Object.assign(after, { categoryGuid: action.categoryGuid, categoryManual: true });
    } else if (action.type === "brand") {
      if (r.brandGuid === action.brandGuid) {
        skip("уже с этим брендом");
        continue;
      }
      Object.assign(before, { brandGuid: r.brandGuid, brandManual: r.brandManual });
      Object.assign(after, { brandGuid: action.brandGuid, brandManual: true });
    } else if (action.type === "visibility") {
      if (r.hidden === action.hidden) {
        skip(action.hidden ? "уже скрыт" : "уже показывается");
        continue;
      }
      before.hidden = r.hidden;
      after.hidden = action.hidden;
    } else if (action.type === "label") {
      const has = r.labels.includes(action.label);
      if (has === action.add) {
        skip(action.add ? "метка уже есть" : "метки нет");
        continue;
      }
      before.labels = r.labels;
      after.labels = action.add ? [...r.labels, action.label] : r.labels.filter((l) => l !== action.label);
    } else if (action.type === "seo") {
      const manual = r.seoSource === "manual";
      const filled = !!(r.seoTitle?.trim() || r.seoDescription?.trim());
      if (filled && action.overwrite === "empty") {
        skip("SEO уже заполнено");
        continue;
      }
      if (manual && filled && action.overwrite !== "all") {
        skip("SEO заполнено вручную (не перезаписываем)");
        continue;
      }
      const v = vars(r);
      const title = action.titleTemplate ? renderFit(action.titleTemplate, v, SEO_LIMITS.title.max) : r.seoTitle;
      const desc = action.descriptionTemplate ? renderFit(action.descriptionTemplate, v, SEO_LIMITS.description.max) : r.seoDescription;
      const keepTitle = action.overwrite === "empty" || (action.overwrite === "template" && manual) ? r.seoTitle?.trim() || title : title;
      const keepDesc = action.overwrite === "empty" || (action.overwrite === "template" && manual) ? r.seoDescription?.trim() || desc : desc;
      if (keepTitle === r.seoTitle && keepDesc === r.seoDescription) {
        skip("без изменений");
        continue;
      }
      Object.assign(before, { seoTitle: r.seoTitle, seoDescription: r.seoDescription, seoSource: r.seoSource });
      Object.assign(after, { seoTitle: keepTitle || null, seoDescription: keepDesc || null, seoSource: "template" });
    } else if (action.type === "description") {
      const cur = r[action.field];
      if (cur?.trim() && action.overwrite === "empty") {
        skip("уже заполнено");
        continue;
      }
      const text = renderTemplate(action.template, vars(r));
      if (text === cur) {
        skip("без изменений");
        continue;
      }
      before[action.field] = cur;
      after[action.field] = text;
      if (action.field === "description") {
        before.descriptionManual = r.descriptionManual;
        after.descriptionManual = true; // 1С больше не перезаписывает
      }
    }
    changes.push({ id: r.id, name: r.name, before, after });
  }

  if (action.type === "seo") {
    // одинаковые заголовки у разных товаров — плохо для поиска
    const titles = new Map<string, number>();
    for (const c of changes) if (c.after.seoTitle) titles.set(c.after.seoTitle, (titles.get(c.after.seoTitle) ?? 0) + 1);
    const dup = [...titles.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);
    if (dup) warnings.push(`Одинаковый Title получат ${dup} товаров — добавьте в шаблон {article} или {brand}`);
    const longT = changes.filter((c) => c.after.seoTitle && /длинный|короткий/.test(lengthIssue("title", c.after.seoTitle) ?? "")).length;
    const longD = changes.filter((c) => c.after.seoDescription && /длинный|короткий/.test(lengthIssue("description", c.after.seoDescription) ?? "")).length;
    if (longT) warnings.push(`Title вне ${SEO_LIMITS.title.min}–${SEO_LIMITS.title.max} символов: ${longT} (длинные обрезаются по слову)`);
    if (longD) warnings.push(`Description вне ${SEO_LIMITS.description.min}–${SEO_LIMITS.description.max} символов: ${longD}`);
  }
  if ((action.type === "category" || action.type === "brand") && changes.length)
    warnings.push(`${action.type === "category" ? "Категория" : "Бренд"} этих товаров станет «изменённым на сайте»: обмен с 1С больше не будет её менять (вернуть из 1С можно в карточке).`);

  const FIELD: Record<string, string> = {
    categoryGuid: "Категория",
    brandGuid: "Бренд",
    hidden: "Скрыт",
    labels: "Метки",
    seoTitle: "SEO Title",
    seoDescription: "Meta Description",
    shortDescription: "Краткое описание",
    description: "Описание",
  };
  const names = new Map<string, string>();
  if (action.type === "category" || action.type === "brand") {
    const guids = [...new Set(changes.flatMap((c) => [c.before.categoryGuid, c.after.categoryGuid, c.before.brandGuid, c.after.brandGuid]).filter((x): x is string => !!x))];
    for (const c of await prisma.category.findMany({ where: { guid: { in: guids } }, select: { guid: true, name: true } })) names.set(c.guid, c.name);
    for (const b of await prisma.brand.findMany({ where: { guid: { in: guids } }, select: { guid: true, name: true } })) names.set(b.guid, b.name);
  }
  const show = (k: string, v: unknown) =>
    v == null || v === "" ? "—" : typeof v === "boolean" ? (v ? "да" : "нет") : Array.isArray(v) ? v.map((x) => ({ new: "Новинка", hit: "Хит" })[x as string] ?? x).join(", ") || "—" : names.get(String(v)) ?? String(v);
  const examples = changes.slice(0, 12).flatMap((c) =>
    Object.keys(c.after)
      .filter((k) => k in FIELD)
      .map((k) => ({ id: c.id, name: c.name, field: FIELD[k], before: show(k, c.before[k as keyof Fields]), after: show(k, c.after[k as keyof Fields]) }))
  );

  return {
    changes,
    preview: { total: ids.length, changed: changes.length, skipped: [...skipped].map(([reason, count]) => ({ reason, count })), examples, warnings },
  };
}

/** writes the changes (in parts of 300) and keeps them for «Отменить» */
export async function applyChanges(changes: Change[], action: BulkAction, summary: string, userName: string) {
  for (let i = 0; i < changes.length; i += 300) {
    await prisma.$transaction(changes.slice(i, i + 300).map((c) => prisma.product.update({ where: { id: c.id }, data: c.after as Prisma.ProductUncheckedUpdateInput })));
  }
  return prisma.cmsBulkOperation.create({
    data: { type: action.type, summary, count: changes.length, changes: changes.map((c) => ({ id: c.id, before: c.before, after: c.after })) as unknown as Prisma.InputJsonValue, userName },
  });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** «Отменить»: back to the values before, only where the product still has what the operation wrote */
export async function undoOperation(opId: number, userName: string) {
  const op = await prisma.cmsBulkOperation.findUnique({ where: { id: opId } });
  if (!op) throw new Error("Операция не найдена");
  if (op.undoneAt) throw new Error("Операция уже отменена");
  const changes = op.changes as unknown as { id: number; before: Fields; after: Fields }[];
  let restored = 0;
  let conflicts = 0;
  for (let i = 0; i < changes.length; i += 1000) {
    const part = changes.slice(i, i + 1000);
    const cur = await prisma.product.findMany({ where: { id: { in: part.map((c) => c.id) } } });
    const byId = new Map(cur.map((p) => [p.id, p as unknown as Record<string, unknown>]));
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const c of part) {
      const p = byId.get(c.id);
      if (!p) continue;
      const untouched = Object.entries(c.after).every(([k, v]) => same(p[k], v));
      if (!untouched) {
        conflicts++;
        continue;
      }
      ops.push(prisma.product.update({ where: { id: c.id }, data: c.before as Prisma.ProductUncheckedUpdateInput }));
      restored++;
    }
    for (let j = 0; j < ops.length; j += 300) await prisma.$transaction(ops.slice(j, j + 300));
  }
  await prisma.cmsBulkOperation.update({ where: { id: op.id }, data: { undoneAt: new Date(), undoneBy: userName } });
  return { restored, conflicts };
}
