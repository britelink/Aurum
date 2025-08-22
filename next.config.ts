import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://eu-prod.oppwa.com https://eu-test.oppwa.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
