import type { Metadata } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: { default: "Админ-панель", template: "%s — Админ-панель Косметички" },
  robots: { index: false, follow: false },
};

// Админ-панель admin.kosmetichka-opt.ru (proxy.ts переписывает адреса поддомена в /cms).
// Слой поверх витринной обвязки корневого layout: белый фон, свой Toaster.
export default function CmsRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] overflow-auto bg-white font-[Inter,system-ui,sans-serif] text-neutral-900 antialiased">
      {children}
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
