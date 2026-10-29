import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
  async rewrites() {
    const userServiceUrl =
      process.env.USER_SERVICE_URL ||
      process.env.NEXT_PUBLIC_USER_SERVICE_URL ||
      'http://localhost:3000';
    return [
      {
        source: '/api/v1/users/:path*',
        destination: `${userServiceUrl}/users/:path*`,
      },
      {
        source: '/api/v1/reports/:path*',
        destination: `${userServiceUrl}/reports/:path*`,
      },
      {
        source: '/api/v1/reports',
        destination: `${userServiceUrl}/reports`,
      },
      {
        source: '/reports/:path*',
        destination: `${userServiceUrl}/reports/:path*`,
      },
      {
        source: '/reports',
        destination: `${userServiceUrl}/reports`,
      },
    ];
  },
};

export default nextConfig;
