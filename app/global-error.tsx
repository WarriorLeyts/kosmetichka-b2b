"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: "20px", fontFamily: "monospace", background: "#fff" }}>
        <h1 style={{ color: "red", fontSize: "18px" }}>Ошибка (iOS debug)</h1>
        <pre style={{ background: "#fee", padding: "10px", fontSize: "12px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {error?.message}
          {"\n\n"}
          {error?.stack}
        </pre>
        <button onClick={reset} style={{ marginTop: "10px", padding: "8px 16px" }}>
          Попробовать снова
        </button>
      </body>
    </html>
  );
}
