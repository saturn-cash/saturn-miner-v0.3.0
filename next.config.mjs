/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tauri serves the app from static files, so build a plain HTML/JS export into ./out
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
