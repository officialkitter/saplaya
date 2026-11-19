import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL('../', import.meta.url)),
  reactStrictMode: true,
  experimental: { cpus: 1 },
};

export default nextConfig;
