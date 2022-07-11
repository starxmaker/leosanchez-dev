module.exports = {
  reactStrictMode: true,
  images: {
    domains: ['d1zce54be1puoh.cloudfront.net'],
    formats: ['image/avif', 'image/webp'],
  },
  webpack5: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false };

    return config;
  }
}
