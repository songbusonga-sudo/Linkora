import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["node:sqlite"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Link",
            value: '</api/source>; rel="source"; type="application/zip"',
          },
        ],
      },
    ];
  },
};
export default config;
