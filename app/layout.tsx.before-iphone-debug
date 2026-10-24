import type { Metadata } from "next";

import "./globals.css";
import { CartDrawer } from "@/components/catalog/CartDrawer";
import { FavoriteDrawer } from "@/components/catalog/FavoriteDrawer";
import { CartToast } from "@/components/catalog/CartToast";
import { OrderNotifications } from "@/components/orders/OrderNotifications";
import { CompareBar } from "@/components/compare/CompareBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CookieBanner } from "@/components/CookieBanner";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: {
    default: "Косметичка — оптовая косметика и парфюмерия",
    template: "%s | Косметичка",
  },
  description:
    "Оптовый интернет-магазин косметики и парфюмерии. Широкий ассортимент, выгодные цены для магазинов и салонов красоты.",
  metadataBase: new URL("https://kosmetichka-opt.ru"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "https://kosmetichka-opt.ru",
    siteName: "Косметичка",
    title: "Косметичка — оптовая косметика и парфюмерия",
    description:
      "Оптовый интернет-магазин косметики и парфюмерии. Широкий ассортимент, выгодные цены для магазинов и салонов красоты.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        {children}
        <CartDrawer />
        <FavoriteDrawer />
        <CartToast />
        <OrderNotifications />
        <CompareBar />
        <MobileBottomNav />
        <CookieBanner />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
