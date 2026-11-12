"use client";
import { useCallback, useEffect, useState } from "react";
import { Monitor, Pencil, Plus, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { Badge, Btn, Card, Empty, Field, Input, PageHeader, Toggle, useConfirm } from "@/components/cms/ui";
import { ImageUpload } from "@/components/cms/ImageUpload";

export type Banner = {
  id: number;
  title: string;
  subtitle: string | null;
  buttonText: string | null;
  link: string | null;
  imageDesktop: string | null;
  imageMobile: string | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  deletedAt: string | null;
  updatedAt: string;
};

type Draft = Omit<Banner, "id" | "deletedAt" | "updatedAt"> & { id?: number };
const EMPTY: Draft = { title: "", subtitle: "", buttonText: "", link: "", imageDesktop: null, imageMobile: null, active: true, startsAt: null, endsAt: null };

// <input type="datetime-local"> ⇄ ISO
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function status(b: Banner) {
  const now = Date.now();
  if (!b.active) return <Badge>Выключен</Badge>;
  if (b.startsAt && new Date(b.startsAt).getTime() > now) return <Badge tone="amber">С {fmtDate(b.startsAt)}</Badge>;
  if (b.endsAt && new Date(b.endsAt).getTime() < now) return <Badge tone="red">Закончился</Badge>;
  return <Badge tone="green">Показывается</Badge>;
}

export function BannersClient({ canDelete }: { canDelete: boolean }) {
  const [tab, setTab] = useState<"list" | "trash">("list");
  const [list, setList] = useState<Banner[] | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      const r = await cmsApi<{ banners: Banner[] }>(`/api/cms/banners${tab === "trash" ? "?deleted=1" : ""}`);
      setList(r.banners);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
      setList([]);
    }
  }, [tab]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const { id, ...data } = edit;
      await cmsApi(id ? `/api/cms/banners/${id}` : "/api/cms/banners", { method: id ? "PUT" : "POST", body: data });
      toast.success("Баннер сохранён");
      setEdit(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (b: Banner) => {
    try {
      await cmsApi(`/api/cms/banners/${b.id}`, { method: "PUT", body: { ...b, active: !b.active } });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const remove = async (b: Banner) => {
    if (!(await confirm(`Удалить баннер «${b.title}» в корзину?\nЕго можно будет вернуть.`))) return;
    try {
      await cmsApi(`/api/cms/banners/${b.id}`, { method: "DELETE" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      if (!msg.includes("опубликованной главной") || !(await confirm(msg))) return toast.error(msg);
      await cmsApi(`/api/cms/banners/${b.id}?force=1`, { method: "DELETE" });
    }
    toast.success("Баннер в корзине");
    load();
  };

  const restore = async (b: Banner) => {
    await cmsApi(`/api/cms/banners/${b.id}`, { body: { action: "restore" } }).catch((e) => toast.error(e.message));
    toast.success("Баннер возвращён (выключен — включите, когда нужно)");
    load();
  };

  return (
    <div className="max-w-6xl">
      {dialog}
      <PageHeader
        title="Баннеры"
        subtitle="Отдельные картинки для компьютера и телефона. На главную баннеры ставятся в редакторе главной (блок «Баннеры»)."
        actions={
          <>
            <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5 text-sm">
              {(["list", "trash"] as const).map((t) => (
                <button key={t} onClick={() => (setList(null), setTab(t))} className={`rounded-md px-3 py-1.5 ${tab === t ? "bg-[#FBEFF3] text-[#8E1B47]" : "text-neutral-600"}`}>
                  {t === "list" ? "Баннеры" : "Корзина"}
                </button>
              ))}
            </div>
            {tab === "list" ? (
              <Btn onClick={() => setEdit({ ...EMPTY })}>
                <Plus className="size-4" /> Новый баннер
              </Btn>
            ) : null}
          </>
        }
      />

      {list === null ? (
        <div className="text-sm text-neutral-500">Загрузка…</div>
      ) : list.length === 0 ? (
        <Empty>{tab === "list" ? "Баннеров пока нет. Нажмите «Новый баннер»." : "Корзина пуста."}</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              <div className="grid grid-cols-[1fr_96px] gap-2 bg-neutral-50 p-2">
                <div className="relative aspect-[16/6] overflow-hidden rounded-md bg-neutral-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {b.imageDesktop ? <img src={`/1c/${b.imageDesktop}`} alt="" className="h-full w-full object-cover" /> : null}
                  <Monitor className="absolute left-1.5 top-1.5 size-3.5 text-white drop-shadow" />
                </div>
                <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-neutral-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {b.imageMobile ? <img src={`/1c/${b.imageMobile}`} alt="" className="h-full w-full object-cover" /> : null}
                  <Smartphone className="absolute left-1.5 top-1.5 size-3.5 text-white drop-shadow" />
                </div>
              </div>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="truncate font-medium">{b.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    {tab === "list" ? status(b) : <Badge tone="red">Удалён {fmtDate(b.deletedAt)}</Badge>}
                    {b.link ? <span className="truncate">→ {b.link}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {tab === "list" ? (
                    <>
                      <Toggle checked={b.active} onChange={() => toggle(b)} />
                      <Btn variant="ghost" size="sm" onClick={() => setEdit({ ...b })} aria-label="Изменить">
                        <Pencil className="size-4" />
                      </Btn>
                      {canDelete ? (
                        <Btn variant="ghost" size="sm" onClick={() => remove(b)} aria-label="Удалить">
                          <Trash2 className="size-4 text-red-600" />
                        </Btn>
                      ) : null}
                    </>
                  ) : (
                    <Btn variant="outline" size="sm" onClick={() => restore(b)}>
                      <RotateCcw className="size-4" /> Вернуть
                    </Btn>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {edit ? (
        <div className="fixed inset-0 z-[150] flex justify-end bg-black/30" onClick={() => !saving && setEdit(null)}>
          <div className="h-full w-full max-w-xl overflow-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-5 text-lg font-semibold">{edit.id ? "Изменить баннер" : "Новый баннер"}</h2>
            <div className="space-y-4">
              <Field label="Название (видно только в панели и как подпись)">
                <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={120} />
              </Field>
              <ImageUpload
                label="Картинка для компьютера"
                hint="Широкая, примерно 1920×720 (8:3). JPG, PNG или WebP до 15 МБ."
                folder="banners"
                value={edit.imageDesktop}
                onChange={(v) => setEdit({ ...edit, imageDesktop: v })}
              />
              <ImageUpload
                label="Картинка для телефона"
                hint="Вертикальная или квадратная, примерно 1080×1350 (4:5). Если не загрузить — возьмётся картинка для компьютера."
                folder="banners"
                aspect="aspect-[4/5] max-w-[220px]"
                value={edit.imageMobile}
                onChange={(v) => setEdit({ ...edit, imageMobile: v })}
              />
              <Field label="Подзаголовок (необязательно)">
                <Input value={edit.subtitle ?? ""} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} maxLength={200} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Текст кнопки">
                  <Input value={edit.buttonText ?? ""} onChange={(e) => setEdit({ ...edit, buttonText: e.target.value })} maxLength={40} placeholder="Смотреть" />
                </Field>
                <Field label="Ссылка" hint="/catalog?quick=sale, /product/123 или https://…">
                  <Input value={edit.link ?? ""} onChange={(e) => setEdit({ ...edit, link: e.target.value })} placeholder="/catalog" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Показывать с">
                  <Input type="datetime-local" value={toLocal(edit.startsAt)} onChange={(e) => setEdit({ ...edit, startsAt: fromLocal(e.target.value) })} />
                </Field>
                <Field label="Показывать до">
                  <Input type="datetime-local" value={toLocal(edit.endsAt)} onChange={(e) => setEdit({ ...edit, endsAt: fromLocal(e.target.value) })} />
                </Field>
              </div>
              <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Включён" />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setEdit(null)} disabled={saving}>
                Отмена
              </Btn>
              <Btn onClick={save} loading={saving}>
                Сохранить
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
