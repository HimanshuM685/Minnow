import type { NextConfig } from 'next';
const config: NextConfig = { transpilePackages: ['@minnow/db'], experimental: { authInterrupts: true } };
export default config;
