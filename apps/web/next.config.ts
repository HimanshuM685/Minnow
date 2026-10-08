import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';
const config: NextConfig = { async redirects() { return [{ source: '/app/:path*', destination: '/dashboard/:path*', permanent: true }, { source: '/app', destination: '/dashboard', permanent: true }]; }, transpilePackages: ['@minnow/core', '@minnow/db'], cacheComponents: true, experimental: { authInterrupts: true, serverActions: { bodySizeLimit: '3mb' } } };
export default withWorkflow(config);
