import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@studiobalance/domain", "@studiobalance/ui-tokens"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_URL ?? "http://localhost:3001"}/api/:path*` }];
  }
};

export default nextConfig;
