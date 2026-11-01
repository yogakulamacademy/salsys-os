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
  reactStrictMode: true,
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
