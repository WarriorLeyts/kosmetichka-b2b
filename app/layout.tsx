import type { Metadata } from "next";

import "./globals.css";
import { CartDrawer } from "@/components/catalog/CartDrawer";
import { FavoriteDrawer } from "@/components/catalog/FavoriteDrawer";
import { CartToast } from "@/components/catalog/CartToast";

// Intentionally not using next/font/google (Geist/Manrope) here — it
// downloads font files from Google at build/dev time, and on a machine
// with restricted/unstable network access that fetch can hang and stall
// compilation of this layout for every single page. globals.css already
// defines a font-family fallback stack (Manrope, Montserrat, Inter,
// Arial, sans-serif), so this works fine without the network dependency.

export const metadata: Metadata = {
  title: "Косметичка",
  description: "Интернет-магазин косметики",
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

        {/* Mounted once globally so add-to-cart/favorites work from any
            page (product page, home, catalog) without each page having
            to remember to render them. */}
        <CartDrawer />
        <FavoriteDrawer />
        <CartToast />
      </body>
    </html>
  );
}
