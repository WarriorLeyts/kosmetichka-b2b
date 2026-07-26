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
      onError={() => setFailed(true)}
    />
  );
}
