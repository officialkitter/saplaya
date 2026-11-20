import { fileURLToPath } from 'node:url';

const remotePatterns = [{ protocol: 'https', hostname: 'images.unsplash.com' }];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl) {
  const supabase = new URL(supabaseUrl);
  remotePatterns.push({
    protocol: supabase.protocol.slice(0, -1),
    hostname: supabase.hostname,
    pathname: '/storage/v1/object/public/**',
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL('../', import.meta.url)),
  reactStrictMode: true,
  experimental: { cpus: 1 },
  images: { remotePatterns },
};

export default nextConfig;
