"use client";

import { X, ChevronUp, ChevronDown } from "lucide-react";
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

  function scrollThumbs(dir: "up" | "down") {
    if (!thumbsRef.current) return;
    thumbsRef.current.scrollBy({ top: dir === "up" ? -180 : 180, behavior: "smooth" });
  }

  return (
    <>
      <div className="flex gap-3">
        {/* ── Vertical thumbnail strip ── */}
        {safeImages.length > 1 && (
          <div className="flex w-[72px] flex-shrink-0 flex-col gap-1">
            {safeImages.length > 5 && (
              <button
                type="button"
                onClick={() => scrollThumbs("up")}
                className="flex h-6 items-center justify-center text-slate-400 hover:text-pink-500"
              >
                <ChevronUp size={16} />
              </button>
            )}
            <div
              ref={thumbsRef}
              className="flex flex-col gap-2 overflow-y-auto scrollbar-hide"
              style={{ maxHeight: "430px" }}
            >
              {safeImages.map((image, index) => {
                const src = resolveImageUrl(image.path) ?? "";
                const isActive = index === activeIndex;
                return (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`flex h-[68px] w-[68px] flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border bg-white p-1.5 transition ${
                      isActive
                        ? "border-pink-400 ring-2 ring-pink-100"
                        : "border-slate-200 hover:border-pink-200"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`${productName} ${index + 1}`}
                      loading={index < 6 ? "eager" : "lazy"}
                      className="max-h-full max-w-full object-contain"
                    />
                  </button>
                );
              })}
            </div>
            {safeImages.length > 5 && (
              <button
                type="button"
                onClick={() => scrollThumbs("down")}
                className="flex h-6 items-center justify-center text-slate-400 hover:text-pink-500"
              >
                <ChevronDown size={16} />
              </button>
            )}
          </div>
        )}

        {/* ── Main image ── */}
        <button
          type="button"
          onClick={() => imageSrc && setIsLightboxOpen(true)}
          className="relative flex min-h-[260px] flex-1 cursor-zoom-in items-center justify-center rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm md:min-h-[430px] md:rounded-[28px] md:p-6"
        >
          <SafeImage
            src={imageSrc}
            alt={productName}
            className="max-h-[230px] max-w-full object-contain md:max-h-[390px]"
            placeholderIconSize={28}
            loading="eager"
          />
          {safeImages.length > 1 && (
            <span className="absolute bottom-3 right-3 rounded-lg bg-black/40 px-2 py-0.5 text-xs font-semibold text-white">
              {activeIndex + 1} / {safeImages.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Lightbox ── */}
      {isLightboxOpen && imageSrc && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-6"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute right-6 top-6 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
          >
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={productName}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {/* Prev / Next in lightbox */}
          {safeImages.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 text-xl"
                onClick={(e) => { e.stopPropagation(); setActiveIndex((i) => (i - 1 + safeImages.length) % safeImages.length); }}
              >
                ‹
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 text-xl"
                onClick={(e) => { e.stopPropagation(); setActiveIndex((i) => (i + 1) % safeImages.length); }}
              >
                ›
              </button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-white">
                {activeIndex + 1} / {safeImages.length}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}
