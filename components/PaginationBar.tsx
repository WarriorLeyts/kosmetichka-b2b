import Link from "next/link";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}

export default function PaginationBar({ page, totalPages, buildHref }: PaginationBarProps) {
  if (totalPages <= 1) return null;

  // Show window of pages around current: always first, last, and ±2 around current
  const pages: (number | "…")[] = [];
  const range = new Set<number>();
  range.add(1);
  range.add(totalPages);
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) range.add(i);
  const sorted = Array.from(range).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) pages.push("…");
    pages.push(sorted[i]);
  }

  return (
    <div className="mt-6 flex items-center justify-center gap-1 flex-wrap">
      <Link
        href={page > 1 ? buildHref(page - 1) : "#"}
        aria-disabled={page <= 1}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm ${
          page <= 1
            ? "pointer-events-none text-slate-300 border-slate-200"
            : "hover:bg-slate-50 text-slate-600"
        }`}
      >
        ←
      </Link>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="flex h-9 w-9 items-center justify-center text-sm text-slate-400">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium ${
              p === page
                ? "bg-slate-900 text-white border-slate-900"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p}
          </Link>
        )
      )}

      <Link
        href={page < totalPages ? buildHref(page + 1) : "#"}
        aria-disabled={page >= totalPages}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm ${
          page >= totalPages
            ? "pointer-events-none text-slate-300 border-slate-200"
            : "hover:bg-slate-50 text-slate-600"
        }`}
      >
        →
      </Link>
    </div>
  );
}
