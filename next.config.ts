import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // data/ (файлы обмена с 1С) живёт вне сборки: /root/kosmetichka-data, в сборку подключается ссылкой
  // (см. deploy.sh). Без этого Next копировал бы в .next/standalone старую локальную папку data/1c.
  outputFileTracingExcludes: { "*": ["./data/**"] },
  // invoice PDF: pdfkit runs as a plain Node package (it reads its own data files), the Inter fonts
  // it embeds are copied into the standalone build with the route
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: { "/api/orders/*/invoice-pdf": ["./assets/fonts/**", "./node_modules/pdfkit/js/data/**"] },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: process.env.IMAGES_HOSTNAME ?? "" },
    ],
  },
  devIndicators: false,
  // картинки оформления (/app/*) меняются только с релизом — пусть браузер держит их неделю
  async headers() {
    return [
      // basic protection for every answer of the site: no MIME sniffing, the site can't be put inside
      // another site's frame (clickjacking), HTTPS remembered by the browser, no full URLs to other sites
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/app/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
  // the old Next pages were removed (audit ARCH-04): their addresses lead to the apps
  async redirects() {
    return [
      { source: "/compare", destination: "/catalog", permanent: true },
      { source: "/picker/:id(\\d+)", destination: "/admin/pick/:id", permanent: false },
      { source: "/picker/:path*", destination: "/admin/picker", permanent: false },
      { source: "/picker", destination: "/admin/picker", permanent: false },
    ];
  },
  async rewrites() {
    const rules = [];

    if (process.env.NODE_ENV === "development") {
      rules.push({
        source: "/1c/:path*",
        destination: "https://kosmetichka-opt.ru/1c/:path*",
      });
    }

    // На Vercel проксируем картинки с основного VPS
    if (process.env.VERCEL) {
      rules.push({
        source: "/image/:path*",
        destination: "https://kosmetichka-opt.ru/image/:path*",
      });
    }

    return rules;
  },
};

export default nextConfig;
