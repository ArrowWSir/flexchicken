// The apps a phone or the till can add to its home screen: one per screen,
// so the till opens straight on its orders and a driver straight on
// deliveries. Each is a web app manifest at /apps/<id>.webmanifest
// (app/apps/[file]/route.js), linked from that screen's layout.

const LIGHT = { theme: "#ecdecb", background: "#ecdecb" }; // --color-ground
const DARK = { theme: "#160d09", background: "#160d09" }; // --color-roast-950

export const APPS = Object.freeze({
  customer: { name: "Flex Chicken", short: "Flex Chicken", path: "/", scope: "/", label: "Flex Chicken", ...LIGHT },
  staff: { name: "Flex Chicken Orders", short: "Orders", path: "/staff", scope: "/staff", label: "the Orders app", ...DARK },
  admin: { name: "Flex Chicken Admin", short: "Admin", path: "/admin", scope: "/admin", label: "the Admin app", ...DARK },
  driver: { name: "Flex Chicken Delivery", short: "Delivery", path: "/driver", scope: "/driver", label: "the Delivery app", ...DARK },
  clock: { name: "Flex Chicken Clock", short: "Clock", path: "/clock", scope: "/clock", label: "the Clock app", ...DARK },
});

/** The app a page belongs to, by its path. */
export function appFor(pathname) {
  const section = String(pathname ?? "/").split("/")[1];
  return Object.hasOwn(APPS, section) && section !== "customer" ? section : "customer";
}

export const manifestUrl = (id) => `/apps/${id}.webmanifest`;

/** The web app manifest for `id`. */
export function manifestFor(id) {
  const app = APPS[id];
  return {
    id: app.path,
    name: app.name,
    short_name: app.short,
    start_url: app.path,
    scope: app.scope,
    display: "standalone",
    background_color: app.background,
    theme_color: app.theme,
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

/**
 * Chrome says the page may be installed before React has loaded, so the root
 * layout runs this inline: it keeps the prompt on window.__fcInstall and
 * tells InstallBar (components/InstallBar.js) through an "fc-install" event.
 */
export const CATCH_INSTALL = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__fcInstall=e;window.dispatchEvent(new Event("fc-install"))});window.addEventListener("appinstalled",function(){window.__fcInstall=null;window.dispatchEvent(new Event("fc-install"))});`;
