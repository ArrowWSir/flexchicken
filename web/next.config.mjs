/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hide the dev-mode route badge; it sits on top of the card on phones.
  devIndicators: false,
  // No "X-Powered-By: Next.js": it only tells strangers what to probe for.
  poweredByHeader: false,
  // A stray package-lock.json in the home folder otherwise makes Turbopack
  // guess the wrong workspace root.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
