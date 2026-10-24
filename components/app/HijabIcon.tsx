/** Силуэт девушки в хиджабе, без черт лица (вместо эмодзи 👤).
 *  Платок — сплошной силуэт цвета currentColor, овал лица — прорезь (виден фон), поэтому иконка работает в обеих темах. */
export function HijabIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`app-hijab-icon ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 1.8c-3.9 0-6.8 3-6.8 7.1 0 2.3.75 4.1 1.75 5.45-2.2.9-4.05 2.55-4.6 5.15-.2 1 .55 1.95 1.6 1.95h16.1c1.05 0 1.8-.95 1.6-1.95-.55-2.6-2.4-4.25-4.6-5.15 1-1.35 1.75-3.15 1.75-5.45 0-4.1-2.9-7.1-6.8-7.1zM12 5.9c-1.75 0-3.05 1.65-3.05 3.75S10.25 13.6 12 13.6s3.05-1.85 3.05-3.95S13.75 5.9 12 5.9z"
      />
    </svg>
  );
}
