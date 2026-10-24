import type { Metadata } from "next";
import "./globals.css";
import "./theme-app.css";
import "./theme-dark-generated.css";
import { ClientShell } from "@/components/ClientShell";
import { CLIENT_DIAG } from "@/lib/clientDiag";
import { THEME_INIT_SCRIPT } from "@/lib/themeScript";

export const metadata: Metadata = {
  title: {
    default: "Косметичка — оптовая косметика и парфюмерия",
    template: "%s | Косметичка",
  },
  description:
    "Оптовый интернет-магазин косметики и парфюмерии. Широкий ассортимент, выгодные цены для магазинов и салонов красоты.",
  metadataBase: new URL("https://kosmetichka-opt.ru"),
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
    googleBot: { index: true, follow: true },
  },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#170D25" media="(prefers-color-scheme: dark)" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: CLIENT_DIAG,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ClientShell />
      </body>
    </html>
  );
}
