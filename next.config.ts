<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD

=======
>>>>>>> 73da13e (initial scaffold)
=======

>>>>>>> e06a37c (vv)
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
<<<<<<< HEAD
<<<<<<< HEAD
  allowedDevOrigins: ["http://localhost:4000", "http://localhost:4001", "https://*.cloudworkstations.dev"],
=======
>>>>>>> 73da13e (initial scaffold)
=======
  allowedDevOrigins: ["http://localhost:4000", "http://localhost:4001", "https://*.cloudworkstations.dev"],
>>>>>>> e06a37c (vv)
=======
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
>>>>>>> a56e62a (2025-06-25T10:13:40Z [web] > nextn@0.1.0 dev)
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
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> e06a37c (vv)
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
    ],
  },
>>>>>>> 73da13e (initial scaffold)
=======
>>>>>>> e06a37c (vv)
=======
  allowedDevOrigins: ["http://localhost:4000", "http://localhost:4002", "https://*.cloudworkstations.dev"],
>>>>>>> a56e62a (2025-06-25T10:13:40Z [web] > nextn@0.1.0 dev)
=======
  allowedDevOrigins: ["http://localhost:3000", "http://localhost:3005", "https://*.cloudworkstations.dev"],
>>>>>>> fa2d911 (Make the following changes:)
};

export default nextConfig;
