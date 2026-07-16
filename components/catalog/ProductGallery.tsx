"use client";

import { X, ChevronLeft, ChevronRight } from "lucide-react";
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

  function prev() {
    setActiveIndex((i) => (i > 0 ? i - 1 : safeImages.length - 1));
  }
  function next() {
    setActiveIndex((i) => (i < safeImages.length - 1 ? i + 1 : 0));
  }

  return (
    <>
      {/* WB-style: vertical thumbs left + main image right */}
      <div className="flex gap-3">
        {/* Vertical thumbnail strip */}
        {safeImages.length > 1 && (
          <div className="hidden flex-col gap-2 md:flex">
            {safeImages.map((image, index) => {
              const src = resolveImageUrl(image.path) ?? "";
              const isActive = index === activeIndex;
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`flex h-[72px] w-[72px] flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 bg-white p-1.5 transition-all ${
                    isActive
                      ? "border-pink-400 shadow-sm ring-2 ring-pink-100"
                      : "border-slate-200 hover:border-pink-200"
                  }`}
                >
                  <img
                    src={src}
                    alt={`${productName} ${index + 1}`}
                    className="max-h-14 max-w-full object-contain"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Main image */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => imageSrc && setIsLightboxOpen(true)}
            className="flex min-h-[220px] w-full cursor-zoom-in items-center justify-center rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm md:min-h-[480px] md:rounded-[24px] md:p-8"
          >
            <SafeImage
              src={imageSrc}
              alt={productName}
              className="max-h-[190px] max-w-full object-contain md:max-h-[420px]"
              placeholderIconSize={28}
            />
          </button>

          {/* Prev/next arrows (visible when multiple images) */}
          {safeImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition hover:border-pink-300 hover:text-pink-500 md:h-10 md:w-10"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition hover:border-pink-300 hover:text-pink-500 md:h-10 md:w-10"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {/* Dot indicators (mobile) */}
          {safeImages.length > 1 && (
            <div className="mt-2 flex justify-center gap-1.5 md:hidden">
              {safeImages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeIndex ? "w-4 bg-pink-500" : "w-1.5 bg-slate-300"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {isLightboxOpen && imageSrc && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-6"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute right-6 top-6 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-white text-slate-900 hover:bg-slate-100"
          >
            <X size={24} />
          </button>
          {safeImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); prev(); }}
                className="absolute left-6 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-white text-slate-900 hover:bg-slate-100"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); next(); }}
                className="absolute right-20 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-white text-slate-900 hover:bg-slate-100"
              >
                <ChevronRight size={24} />
              </button>
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
