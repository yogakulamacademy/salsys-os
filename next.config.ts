import type { NextConfig } from 'next';

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  // Keep local visual QA artifacts separate from a production build.
  distDir: process.env.SALSYS_BUILD_DIR || '.next',
  outputFileTracingRoot: process.cwd(),
  // Self-hosting (Docker on our own server) needs the standalone server
  // bundle. Vercel builds leave this unset and are unchanged.
  ...(process.env.SALSYS_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/automation/approvals',
          destination: '/automation-approvals',
        },
        {
          source: '/admissions',
          has: [
            {
              type: 'query',
              key: 'scope',
              value: 'attribution',
            },
          ],
          destination: '/admissions/attribution',
        },
        {
          source: '/admissions',
          has: [
            {
              type: 'query',
              key: 'scope',
              value: '1',
            },
          ],
          destination: '/admissions/scoped',
        },
        {
          source: '/revenue',
          has: [
            {
              type: 'query',
              key: 'attribution_scope',
              value: '1',
            },
          ],
          destination: '/revenue/attribution',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
