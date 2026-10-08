/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hide the dev-mode route badge; it sits on top of the card on phones.
  devIndicators: false,
  // A stray package-lock.json in the home folder otherwise makes Turbopack
  // guess the wrong workspace root.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
