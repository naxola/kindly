import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Knowledge uploads (PDF ≤ 4 MB, `upload-validation.ts`) travel in a
    // Server Action body; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
