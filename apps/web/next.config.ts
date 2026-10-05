import type { NextConfig } from 'next';
const config: NextConfig = { async redirects() { return [{ source: '/app/:path*', destination: '/dashboard/:path*', permanent: true }, { source: '/app', destination: '/dashboard', permanent: true }]; }, transpilePackages: ['@minnow/core', '@minnow/db'], experimental: { authInterrupts: true, serverActions: { bodySizeLimit: '3mb' } } };
export default config;
