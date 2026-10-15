// The Worker Cloudflare runs. Pages come from the Next.js build (OpenNext);
// everything under /api/ goes to the shop's Durable Object, which holds the
// database (server/shopObject.js).
// @ts-nocheck: .open-next/worker.js only exists after `opennextjs-cloudflare build`.
import nextHandler from "./.open-next/worker.js";

export { ShopObject } from "./server/shopObject.js";

const SHOP = "flexchicken";

// What pages may load, and from where. Every outside service the site uses
// is listed here; add a new one here or the browser blocks it (README,
// "Security"). Scripts and styles allow inline code because Next.js writes
// each page's data into inline scripts and the drawers inject styles; the
// rest is locked to this site.
const CSP_PARTS = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org", // map tiles
  "font-src 'self'",
  "connect-src 'self' wss://flexchicken.uk https://api.postcodes.io https://router.project-osrm.org", // live socket, postcode check, driver routes
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];
const CSP = CSP_PARTS.join("; ");

// The staff screens on the till also send receipts to the Epson printer on
// the shop's network (lib/eposDirect.js), so their pages may reach its
// address too, as the owner set it in Admin → Shop. Nothing else may.
const STAFF_PAGE = /^\/(staff|admin)(\/|$)/;
const PRINTER_ORIGIN = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}$/;
const cspWith = (origins) => CSP_PARTS.map((p) => (p.startsWith("connect-src ") ? [p, ...origins].join(" ") : p)).join("; ");

async function staffPageCsp(env) {
  try {
    const origins = (await shopFor(env).printerConnectOrigins()).filter((o) => PRINTER_ORIGIN.test(o));
    return origins.length ? cspWith(origins) : null;
  } catch (err) {
    // The page still loads; only the till's printing is blocked until the next one.
    console.error("printer csp", err);
    return null;
  }
}

const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  // Location stays on for this site: the checkout and the driver screen use it.
  "permissions-policy": "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
  "cross-origin-opener-policy": "same-origin",
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
    // Always the secure address, and one address for the shop: a phone keeps
    // its loyalty card per address, so www sends everyone to the same one.
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!isLocal && (url.protocol === "http:" || url.hostname === "www.flexchicken.uk")) {
      url.protocol = "https:";
      if (url.hostname === "www.flexchicken.uk") url.hostname = "flexchicken.uk";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith("/api/photo/") && request.method === "GET") return withSecurityHeaders(await photo(request, env, ctx));
    if (url.pathname.startsWith("/api/")) return withSecurityHeaders(await shopFor(env).fetch(request));
    const page = await nextHandler.fetch(request, env, ctx);
    if (STAFF_PAGE.test(url.pathname) && page.headers.get("content-type")?.includes("text/html")) {
      const csp = await staffPageCsp(env);
      if (csp) {
        const out = new Response(page.body, page);
        out.headers.set("content-security-policy", csp);
        return withSecurityHeaders(out);
      }
    }
    return withSecurityHeaders(page);
  },
};
