// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Important for Amplify support
  experimental: {
    serverActions: false, // Avoid breaking "static export"
  },
};

module.exports = nextConfig;
