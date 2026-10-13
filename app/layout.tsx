import type { Metadata } from "next";
import "./globals.css";
import { ClientShell } from "@/components/ClientShell";
import { CLIENT_DIAG } from "@/lib/clientDiag";

export const metadata: Metadata = {
  title: {
    default: "Косметичка — оптовая косметика и парфюмерия",
    template: "%s | Косметичка",
  },
  description:
    "Оптовый интернет-магазин косметики и парфюмерии. Широкий ассортимент, выгодные цены для магазинов и салонов красоты.",
  metadataBase: new URL("https://kosmetichka-opt.ru"),
  alternates: { canonical: "/" },
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
