"use client";

import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { useState } from "react";
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

  const safeImages = images || [];
  const activeImage = safeImages[activeIndex];
  const imageSrc = activeImage?.path ? resolveImageUrl(activeImage.path) : null;

  return (
    <>
      <div className="flex gap-3">
        {/* Вертикальная полоса миниатюр */}
        {safeImages.length > 1 && (
          <div className="flex w-[68px] shrink-0 flex-col gap-2 overflow-y-auto" style={{ maxHeight: 520 }}>
            {safeImages.map((image, index) => {
              const src = resolveImageUrl(image.path) ?? "";
              const isActive = index === activeIndex;
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`flex h-[68px] w-[68px] shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 bg-white p-1 transition ${
                    isActive
                      ? "border-pink-400 ring-2 ring-pink-100"
                      : "border-slate-200 hover:border-pink-300"
                  }`}
                >
                  <img
                    src={src}
                    alt={`${productName} ${index + 1}`}
                    className="max-h-14 max-w-full object-contain"
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Главное изображение */}
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => imageSrc && setIsLightboxOpen(true)}
            className="group relative flex min-h-[300px] w-full cursor-zoom-in items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 md:min-h-[480px]"
          >
            <SafeImage
              src={imageSrc}
              alt={productName}
              className="max-h-[260px] max-w-full object-contain md:max-h-[440px]"
              placeholderIconSize={32}
            />
            <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-slate-500 opacity-0 shadow transition group-hover:opacity-100">
              <ZoomIn size={16} />
            </span>
          </button>

          {/* Счётчик */}
          {safeImages.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-0.5 text-xs font-semibold text-white">
              {activeIndex + 1} / {safeImages.length}
            </div>
          )}
        </div>
      </div>

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
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex((activeIndex - 1 + safeImages.length) % safeImages.length);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/90 text-slate-800 hover:bg-white"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex((activeIndex + 1) % safeImages.length);
                }}
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
