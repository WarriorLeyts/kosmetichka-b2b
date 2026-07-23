"use client";

import { X, ChevronLeft, ChevronRight, ZoomIn, Images } from "lucide-react";
import { useState, useRef } from "react";
import { SafeImage } from "./SafeImage";
import { resolveImageUrl } from "@/lib/image";

type ProductImage = { id: number; path: string };
type Props = { images: ProductImage[]; productName: string };

const THUMBS_INITIAL = 12;

export function ProductGallery({ images, productName }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [showAllThumbs, setShowAllThumbs] = useState(false);
  const thumbsRef = useRef<HTMLDivElement>(null);

  const safeImages = images || [];
  const activeImage = safeImages[activeIndex];
  const imageSrc = activeImage?.path ? resolveImageUrl(activeImage.path) : null;

  const visibleThumbs = showAllThumbs
    ? safeImages
    : safeImages.slice(0, THUMBS_INITIAL);
  const hiddenCount = safeImages.length - THUMBS_INITIAL;

  const goTo = (index: number) => {
    setActiveIndex(index);
    const strip = thumbsRef.current;
    if (strip) {
      const btn = strip.children[index] as HTMLElement;
      btn?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  };

  return (
    <>
      {/* Главное изображение — фиксированная высота */}
      <div className="relative">
        <button
          type="button"
          onClick={() => imageSrc && setIsLightboxOpen(true)}
          className="group relative flex h-[380px] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white md:h-[460px]"
        >
          <SafeImage
            src={imageSrc}
            alt={productName}
            className="h-full w-full object-contain p-4"
            placeholderIconSize={32}
          />
          <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-slate-500 opacity-0 shadow transition group-hover:opacity-100">
            <ZoomIn size={15} />
          </span>
        </button>

        {/* Стрелки */}
        {safeImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo((activeIndex - 1 + safeImages.length) % safeImages.length)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 shadow-md hover:bg-white"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => goTo((activeIndex + 1) % safeImages.length)}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/90 shadow-md hover:bg-white"
            >
              <ChevronRight size={18} />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-0.5 text-xs font-semibold text-white">
              {activeIndex + 1} / {safeImages.length}
            </div>
          </>
        )}
      </div>

      {/* Миниатюры */}
      {safeImages.length > 1 && (
        <div className="mt-3">
          <div ref={thumbsRef} className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))" }}>
            {visibleThumbs.map((image, index) => {
              const src = resolveImageUrl(image.path) ?? "";
              const isActive = index === activeIndex;
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => goTo(index)}
                  className={`aspect-square w-full cursor-pointer overflow-hidden rounded-lg border-2 bg-white transition ${
                    isActive
                      ? "border-pink-400 ring-2 ring-pink-100"
                      : "border-slate-200 hover:border-pink-300"
                  }`}
                >
                  <img
                    src={src}
                    alt={`${productName} ${index + 1}`}
                    className="h-full w-full object-contain p-1"
                    loading="lazy"
                  />
                </button>
              );
            })}

            {/* Кнопка «Показать ещё» */}
            {!showAllThumbs && hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllThumbs(true)}
                className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 transition hover:border-pink-300 hover:bg-pink-50 hover:text-pink-500"
              >
                <Images size={18} />
                <span className="text-[11px] font-bold leading-tight">+{hiddenCount}</span>
              </button>
            )}
          </div>

          {showAllThumbs && safeImages.length > THUMBS_INITIAL && (
            <button
              type="button"
              onClick={() => setShowAllThumbs(false)}
              className="mt-2 w-full rounded-xl border border-slate-200 py-1.5 text-xs font-semibold text-slate-500 hover:border-pink-200 hover:text-pink-500"
            >
              Свернуть
            </button>
          )}
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
            className="absolute right-5 top-5 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/90 hover:bg-white"
          >
            <X size={22} />
          </button>
          {safeImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goTo((activeIndex - 1 + safeImages.length) % safeImages.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/90 hover:bg-white"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goTo((activeIndex + 1) % safeImages.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/90 hover:bg-white"
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
