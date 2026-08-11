"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

type Props = {
  src: string | null;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  placeholderText?: string;
  placeholderIconSize?: number;
  onClick?: (event: React.MouseEvent) => void;
  /** "lazy" (default) defers off-screen images; use "eager" for the LCP hero image */
  loading?: "lazy" | "eager";
};

/**
 * <img> that falls back to a placeholder instead of a broken-image icon
 * when the file 404s — handy while data/1c doesn't have the real 1C
 * export images copied into it yet, but also just generally nicer if a
 * product is missing a photo.
 */
export function SafeImage({
  src,
  alt,
  className,
  placeholderClassName = "product-image-placeholder",
  placeholderText = "Фото товара",
  placeholderIconSize = 20,
  onClick,
  loading = "lazy",
}: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={placeholderClassName}>
        <ImageOff size={placeholderIconSize} />
        {placeholderText}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onClick={onClick}
      loading={loading}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
