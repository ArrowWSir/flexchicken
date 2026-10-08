// The one repo for this browser. Never called during server rendering.
//
// NEXT_PUBLIC_STORE=cloud (set by `npm run deploy` / `npm run preview`) uses
// the shop's database on Cloudflare; otherwise (dev, tests, `npm run shop`)
// the browser store holds the data and syncs between tabs of one browser.
// Both give the screens the same repo: reads are instant, changes return
// promises.
import { createCloudRepo } from "./cloud";
import { createLocalStore } from "./local";
import { createRepo } from "./repo";

export const IS_CLOUD = process.env.NEXT_PUBLIC_STORE === "cloud";

const CHANNEL = "flexchicken";
let repo = null;

// Repo actions that go to the server in the cloud, so screens await them.
export const ASYNC_ACTIONS = Object.freeze([
  "placeOrder", "advance", "saveSettings", "saveMenuEdits",
  "addStaff", "updateStaff", "removeStaff", "identify", "clockIn", "clockOut", "correctShift",
  "registerCard", "stampCard", "unstampCard", "redeemCard", "renameCard",
  "issueStampToken", "redeemStampToken", "savePromotion", "removePromotion", "pushLocation",
]);

/** The browser-store repo with the cloud repo's shape: actions return promises. */
export function withAsyncActions(base) {
  const wrapped = { ...base, isReady: () => true, setStaffRole: () => {} };
  for (const name of ASYNC_ACTIONS) wrapped[name] = async (...args) => base[name](...args);
  return wrapped;
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function browserStorage() {
  try {
    const storage = window.localStorage;
    storage.getItem("probe");
    return storage;
  } catch {
    // Blocked site data: the shop still works for this visit.
    return memoryStorage();
  }
}

export function getRepo() {
  if (repo) return repo;
  const storage = browserStorage();
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null;
  const store = createLocalStore({ storage, channel });
  if (!channel) window.addEventListener("storage", store.onStorageEvent);
  const local = createRepo(store);
  repo = IS_CLOUD
    ? createCloudRepo({
        local,
        storage,
        origin: window.location.origin,
        openSocket: typeof WebSocket === "function" ? (url) => new WebSocket(url) : null,
        // Phones freeze hidden tabs; coming back, the screen catches up.
        onVisible: (fn) => document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && fn()),
      })
    : withAsyncActions(local);
  return repo;
}
