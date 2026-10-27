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
    ];
  },
};

export default nextConfig;
