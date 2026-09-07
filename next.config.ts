import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint is run explicitly via `npm run lint`; keep production builds focused on type safety.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
