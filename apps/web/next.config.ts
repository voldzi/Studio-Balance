import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@studiobalance/domain", "@studiobalance/ui-tokens"]
};

export default nextConfig;
