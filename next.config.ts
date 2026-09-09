import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: process.env.IMAGES_HOSTNAME ?? "" },
    ],
  },
  devIndicators: false,
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
