import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'mineskin.eu',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'starlightskins.lunareclipse.studio',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'hangarcdn.papermc.io',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.modrinth.com',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    const backendPort = process.env.BACKEND_PORT || '3005';
    return [
      {
        source: '/api/:path*',
        destination: `http://127.0.0.1:${backendPort}/api/:path*`,
      },
    ];
  },
  allowedDevOrigins: ["http://localhost:3000", "http://localhost:3005", "https://*.cloudworkstations.dev"],
};

export default nextConfig;
