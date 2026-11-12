"use client";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cmsApi } from "@/lib/cms/client";

/** Picture field: uploads to /api/cms/upload, keeps the stored path ("uploads/…webp"). */
export function ImageUpload({
  value,
  onChange,
  folder,
  label,
  hint,
  aspect = "aspect-[16/6]",
}: {
  value: string | null;
  onChange: (path: string | null) => void;
  folder: "banners" | "pages";
  label: string;
  hint?: string;
  aspect?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = value ? `/1c/${value}` : null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", folder);
      const r = await cmsApi<{ path: string }>("/api/cms/upload", { form });
      onChange(r.path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div>
      <div className="mb-1 text-[13px] font-medium text-neutral-700">{label}</div>
      <div
        className={`relative flex ${aspect} w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <button type="button" onClick={() => ref.current?.click()} className="flex flex-col items-center gap-1 text-sm text-neutral-500">
            <ImagePlus className="size-6" />
            Выбрать или перетащить
          </button>
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="size-6 animate-spin text-[#8E1B47]" />
          </div>
        ) : null}
        {url ? (
          <div className="absolute right-2 top-2 flex gap-1">
            <button type="button" onClick={() => ref.current?.click()} className="rounded-md bg-white/90 px-2 py-1 text-xs shadow">
              Заменить
            </button>
            <button type="button" onClick={() => onChange(null)} className="rounded-md bg-white/90 p-1 text-red-600 shadow" aria-label="Убрать">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
      {hint ? <div className="mt-1 text-xs text-neutral-500">{hint}</div> : null}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
