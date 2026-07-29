import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/xenon/:path*",
        destination: `${process.env.XENON_API_URL ?? "http://localhost:4001"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
