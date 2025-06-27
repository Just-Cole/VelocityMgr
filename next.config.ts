import type { NextConfig } from 'next';
import fs from 'fs';
import path from 'path';

// Load config.json
let config = { backend_port: 3005 };
const configPath = path.resolve(process.cwd(), 'config.json');
if (fs.existsSync(configPath)) {
    try {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        // Prevent empty file from causing error
        if (fileContent.trim()) {
            config = { ...config, ...JSON.parse(fileContent) };
        }
    } catch (e) {
        console.error('Error reading or parsing config.json in next.config.ts:', e);
    }
}

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
    const backendPort = process.env.BACKEND_PORT || config.backend_port;
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
