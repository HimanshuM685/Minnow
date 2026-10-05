import type { NextConfig } from 'next';
const config: NextConfig = { transpilePackages: ['@minnow/core', '@minnow/db'], serverExternalPackages: ['pdf-parse'], experimental: { serverActions: { bodySizeLimit: '3mb' } } };
export default config;
