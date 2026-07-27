"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100"
    >
      🖨️ Печать
    </button>
  );
}
