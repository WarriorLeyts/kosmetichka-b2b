"use client";

import { X } from "lucide-react";
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
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => imageSrc && setIsLightboxOpen(true)}
          className="flex min-h-[200px] w-full cursor-zoom-in items-center justify-center rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm md:min-h-[430px] md:rounded-[28px] md:p-6"
        >
          <SafeImage
            src={imageSrc}
            alt={productName}
            className="max-h-[180px] max-w-full object-contain md:max-h-[390px]"
            placeholderIconSize={28}
          />
        </button>

        {safeImages.length > 1 && (
          <div className="grid grid-cols-5 gap-3">
            {safeImages.map((image, index) => {
              const src = resolveImageUrl(image.path) ?? "";
              const isActive = index === activeIndex;

              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`flex h-20 cursor-pointer items-center justify-center rounded-2xl border bg-white p-2 transition ${
                    isActive
                      ? "border-pink-400 ring-2 ring-pink-100"
                      : "border-slate-200 hover:border-pink-200"
                  }`}
                >
                  <img
                    src={src}
                    alt={`${productName} ${index + 1}`}
                    className="max-h-16 max-w-full object-contain"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isLightboxOpen && imageSrc && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute right-6 top-6 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-white text-slate-900"
          >
            <X size={24} />
          </button>

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