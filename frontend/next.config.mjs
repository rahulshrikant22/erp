/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  basePath: process.env.BASE_PATH || '',
  async rewrites() {
    const apiTarget = process.env.BACKEND_INTERNAL_URL || 'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
