// The Worker Cloudflare runs. Pages come from the Next.js build (OpenNext);
// everything under /api/ goes to the shop's Durable Object, which holds the
// database (server/shopObject.js).
// @ts-nocheck: .open-next/worker.js only exists after `opennextjs-cloudflare build`.
import nextHandler from "./.open-next/worker.js";

export { ShopObject } from "./server/shopObject.js";

const SHOP = "flexchicken";

const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), payment=()",
};

function withSecurityHeaders(response) {
  // Socket upgrades and immutable responses pass through untouched.
  if (response.status === 101 || response.webSocket) return response;
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(name)) out.headers.set(name, value);
  return out;
}

const shopFor = (env) => env.SHOP.get(env.SHOP.idFromName(SHOP), { locationHint: "weur" }); // western Europe, by the shop

// Menu photos never change at an address, so the edge keeps them and the
// shop's database is not asked for every view.
async function photo(request, env, ctx) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await shopFor(env).fetch(request);
  if (response.ok) ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/photo/") && request.method === "GET") return withSecurityHeaders(await photo(request, env, ctx));
    if (url.pathname.startsWith("/api/")) return withSecurityHeaders(await shopFor(env).fetch(request));
    return withSecurityHeaders(await nextHandler.fetch(request, env, ctx));
  },
};
