"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cmsApi } from "@/lib/cms/client";
import { Btn, Card, Input, Toggle } from "@/components/cms/ui";
type Variant = { imageId: number; name: string; available: boolean; sortOrder: number };
type Data = { enabled: boolean; images: { id: number; url: string }[]; variants: Variant[] };
export function AssortmentEditor({ id, photoKey }: { id: number; photoKey: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let alive = true; cmsApi<Data>(`/api/cms/products/${id}/assortment`).then(d => { if (alive) { setData(d); setError(""); } }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [id, photoKey]);
  const save = async () => {
    if (!data) return; setBusy(true);
    try { const result = await cmsApi<Data>(`/api/cms/products/${id}/assortment`, { method: "PUT", body: { enabled: data.enabled, variants: data.variants.map((v, i) => ({ ...v, sortOrder: i })) } }); setData(result); toast.success("Ассортимент сохранён"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Не удалось сохранить"); }
    finally { setBusy(false); }
  };
  const change = (imageId: number, patch: Partial<Variant>) => setData(d => d && ({ ...d, variants: d.variants.map(v => v.imageId === imageId ? { ...v, ...patch } : v) }));
  const move = (index: number, delta: number) => setData(d => { if (!d) return d; const variants = [...d.variants]; [variants[index], variants[index + delta]] = [variants[index + delta], variants[index]]; return { ...d, variants }; });
  return <Card className="p-4 space-y-4">
    <h2 className="font-medium">Ассортимент по фото</h2>
    {error ? <p role="alert" className="text-red-600">{error}</p> : !data ? <p>Загрузка…</p> : <>
      <Toggle checked={data.enabled} onChange={enabled => setData({ ...data, enabled })} label="Ассортимент — выбор по фото" />
      <p className="text-sm text-neutral-500">Один товар, цена и общий остаток из 1С. Выберите фото видов: клиент укажет количество каждого. Наличие конкретных видов подтверждает менеджер.</p>
      {data.enabled && <>
        <div className="flex flex-wrap gap-2"><Btn onClick={() => setData({ ...data, variants: data.images.map((img, i) => data.variants.find(v => v.imageId === img.id) ?? { imageId: img.id, name: "", available: true, sortOrder: i }) })}>Отметить все фото</Btn><Btn onClick={() => setData({ ...data, variants: [] })}>Снять выделение</Btn></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{data.images.map(img => <label key={img.id} className="border rounded-xl p-2 cursor-pointer"><img src={img.url} alt="Фото товара" className="h-28 w-full object-contain" /><span className="flex items-center gap-2 mt-2 text-sm"><input type="checkbox" checked={data.variants.some(v => v.imageId === img.id)} onChange={e => setData({ ...data, variants: e.target.checked ? [...data.variants, { imageId: img.id, name: "", available: true, sortOrder: data.variants.length }] : data.variants.filter(v => v.imageId !== img.id) })} />Вариант</span></label>)}</div>
        {!data.images.length && <p className="text-sm">Сначала загрузите фото в блоке «Фотографии».</p>}
        {data.variants.map((v, i) => <div key={v.imageId} className="flex flex-wrap items-center gap-3 border-t pt-3">
          <img src={data.images.find(img => img.id === v.imageId)?.url} alt="Выбранный вид" className="h-16 w-16 object-contain" />
          <div className="flex-1 min-w-40"><Input aria-label={`Название вида ${i + 1}`} placeholder={`Вариант ${i + 1}`} value={v.name} onChange={e => change(v.imageId, { name: e.target.value })} /></div>
          <Toggle checked={v.available} onChange={available => change(v.imageId, { available })} label="Доступен" />
          <Btn disabled={i === 0} onClick={() => move(i, -1)} aria-label="Переместить выше">↑</Btn><Btn disabled={i === data.variants.length - 1} onClick={() => move(i, 1)} aria-label="Переместить ниже">↓</Btn>
        </div>)}
        <p className="text-sm text-neutral-500">В каталоге фотографии доступных видов сменяются каждые 3 секунды. Неотмеченные фото останутся в обычной галерее.</p>
      </>}
      <Btn disabled={busy} onClick={save}>{busy ? "Сохраняем…" : "Сохранить ассортимент"}</Btn>
    </>}
  </Card>;
}
