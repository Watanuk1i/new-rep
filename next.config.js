/** @type {import('next').NextConfig} */
const nextConfig = {
  // gzip/brotli сжатие на edge — быстрее доставка на медленных соединениях
  compress: true,
  // не палим Next.js в заголовках (мелочь, но снимает один header)
  poweredByHeader: false,
  // Реакт-стрикт-режим — лучше ловит баги в dev, в prod не влияет
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
