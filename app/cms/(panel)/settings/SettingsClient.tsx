"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { Btn, Card, Field, Input, PageHeader } from "@/components/cms/ui";

type Arrivals = { newDays: number; backDays: number; updatedAt: string | null; updatedBy: string | null };

export function SettingsClient({ canEdit }: { canEdit: boolean }) {
  const [a, setA] = useState<Arrivals | null>(null);
  const [form, setForm] = useState({ newDays: "", backDays: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    cmsApi<Arrivals>("/api/cms/settings/arrivals")
      .then((r) => {
        if (!alive) return;
        setA(r);
        setForm({ newDays: String(r.newDays), backDays: String(r.backDays) });
      })
      .catch((e) => toast.error(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const dirty = a && (form.newDays !== String(a.newDays) || form.backDays !== String(a.backDays));
  const save = async () => {
    setBusy(true);
    try {
      const body = { newDays: Number(form.newDays), backDays: Number(form.backDays) };
      await cmsApi("/api/cms/settings/arrivals", { method: "PUT", body });
      setA({ ...body, updatedAt: new Date().toISOString(), updatedBy: "вы" });
      toast.success("Сохранено. На сайте и в приложении — в течение 5 минут");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Настройки" subtitle={canEdit ? undefined : "Менять настройки может администратор."} />
      <Card className="p-5">
        <div className="mb-1 font-medium">Новые поступления</div>
        <p className="mb-4 text-sm text-neutral-500">
          Метки на карточках и ленты на главной считаются по приходам и перемещениям из 1С. «Новинка» — товар впервые пришёл в компанию (раньше не было ни
          поступлений, ни оприходований, ни начальных остатков). «Снова в наличии» — пришёл повторно.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="«Новинка» держится, дней" hint="После первого прихода товара в компанию">
            <Input type="number" min={1} max={60} value={form.newDays} disabled={!canEdit} onChange={(e) => setForm({ ...form, newDays: e.target.value })} />
          </Field>
          <Field label="«Снова в наличии» держится, дней" hint="После последнего повторного прихода">
            <Input type="number" min={1} max={60} value={form.backDays} disabled={!canEdit} onChange={(e) => setForm({ ...form, backDays: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canEdit ? (
            <Btn onClick={save} loading={busy} disabled={!dirty}>
              Сохранить
            </Btn>
          ) : null}
          {a?.updatedAt ? (
            <span className="text-xs text-neutral-500">
              Изменено {fmtDate(a.updatedAt)}
              {a.updatedBy ? `, ${a.updatedBy}` : ""}
            </span>
          ) : (
            <span className="text-xs text-neutral-500">Сейчас по умолчанию: 10 и 10 дней</span>
          )}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          От 1 до 60 дней. Если увеличить срок, недостающие документы подгрузятся из 1С сразу после сохранения (пара минут).
        </p>
      </Card>
    </div>
  );
}
