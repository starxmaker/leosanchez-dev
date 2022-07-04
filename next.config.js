module.exports = {
  reactStrictMode: true,
  images: {
    domains: ['images.unsplash.com', 'leonel-sanchez-developer-blog.s3.amazonaws.com'],
    formats: ['image/avif', 'image/webp'],
  },
  webpack5: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false };

    return config;
  }
}
