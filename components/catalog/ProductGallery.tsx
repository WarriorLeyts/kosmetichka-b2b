"use client";

import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { useState, useRef } from "react";
import { SafeImage } from "./SafeImage";
import { resolveImageUrl } from "@/lib/image";

type ProductImage = {
  id: number;
  path: string;
};

type Props = {
  images: ProductImage[];
  productName: string;
};

export function ProductGallery({ images, productName }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const thumbsRef = useRef<HTMLDivElement>(null);

  const safeImages = images || [];
  const activeImage = safeImages[activeIndex];
  const imageSrc = activeImage?.path ? resolveImageUrl(activeImage.path) : null;

  const goTo = (index: number) => {
    setActiveIndex(index);
    // Прокручиваем полосу миниатюр к выбранному элементу
    const strip = thumbsRef.current;
    if (strip) {
      const btn = strip.children[index] as HTMLElement;
      if (btn) btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  return (
    <>
      {/* Главное изображение */}
      <div className="relative">
        <button
          type="button"
          onClick={() => imageSrc && setIsLightboxOpen(true)}
          className="group relative flex w-full cursor-zoom-in items-center justify-center rounded-2xl border border-slate-200 bg-white"
          style={{ minHeight: 340, maxHeight: 520 }}
        >
          <SafeImage
            src={imageSrc}
            alt={productName}
            className="max-h-[480px] min-h-[280px] w-full object-contain"
            placeholderIconSize={32}
          />
          <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-slate-500 opacity-0 shadow transition group-hover:opacity-100">
            <ZoomIn size={16} />
          </span>
        </button>

        {/* Стрелки на главном фото */}
        {safeImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo((activeIndex - 1 + safeImages.length) % safeImages.length)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 shadow hover:bg-white"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => goTo((activeIndex + 1) % safeImages.length)}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 shadow hover:bg-white"
            >
              <ChevronRight size={20} />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-0.5 text-xs font-semibold text-white">
              {activeIndex + 1} / {safeImages.length}
            </div>
          </>
        )}
      </div>

      {/* Горизонтальная полоса миниатюр */}
      {safeImages.length > 1 && (
        <div
          ref={thumbsRef}
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "thin" }}
        >
          {safeImages.map((image, index) => {
            const src = resolveImageUrl(image.path) ?? "";
            const isActive = index === activeIndex;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => goTo(index)}
                className={`flex shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 bg-white transition ${
                  isActive
                    ? "border-pink-400 ring-2 ring-pink-100"
                    : "border-slate-200 hover:border-pink-300"
                }`}
                style={{ width: 72, height: 72, padding: 4 }}
              >
                <img
                  src={src}
                  alt={`${productName} ${index + 1}`}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Лайтбокс */}
      {isLightboxOpen && imageSrc && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute right-5 top-5 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/90 text-slate-800 hover:bg-white"
          >
            <X size={22} />
          </button>

          {safeImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goTo((activeIndex - 1 + safeImages.length) % safeImages.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/90 text-slate-800 hover:bg-white"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goTo((activeIndex + 1) % safeImages.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/90 text-slate-800 hover:bg-white"
              >
                <ChevronRight size={22} />
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1 text-sm font-semibold text-white">
                {activeIndex + 1} / {safeImages.length}
              </div>
            </>
          )}

          <img
            src={imageSrc}
            alt={productName}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
