/**
 * «КОСМЕТИЧКА» — фирменная надпись как в приложении: широкие заглавные в фирменном фиолетовом
 * (светлые в тёмной теме), над «И» — наш логотип-сердце красного цвета.
 */
export function Wordmark({ size = 19, light = false, className = "" }: { size?: number; light?: boolean; className?: string }) {
  return (
    <span
      className={`app-wordmark${light ? " app-wordmark--light" : ""} ${className}`}
      style={{ fontSize: size }}
      aria-label="Косметичка"
      role="img"
    >
      <span aria-hidden>КОСМЕТ</span>
      <span className="app-wordmark__i" aria-hidden>И</span>
      <span aria-hidden>ЧКА</span>
    </span>
  );
}
