import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: process.env.IMAGES_HOSTNAME ?? "" },
    ],
  },
};

export default nextConfig;
