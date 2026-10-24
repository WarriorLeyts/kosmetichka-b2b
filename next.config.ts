import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // data/ (файлы обмена с 1С) живёт вне сборки: /root/kosmetichka-data, в сборку подключается ссылкой
  // (см. deploy.sh). Без этого Next копировал бы в .next/standalone старую локальную папку data/1c.
  outputFileTracingExcludes: { "*": ["./data/**"] },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: process.env.IMAGES_HOSTNAME ?? "" },
    ],
  },
  devIndicators: false,
  // картинки оформления (/app/*) меняются только с релизом — пусть браузер держит их неделю
  async headers() {
    return [
      {
        source: "/app/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
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
