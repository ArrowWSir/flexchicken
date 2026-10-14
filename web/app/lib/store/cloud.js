// Database adapter: the same repo the screens already use, backed by the
// shop's server (server/api.js) instead of this browser.
//
// Reads stay instant: each topic is fetched once into a cache and the screen
// reads from that. A live socket says when a topic changes anywhere, and the
// cache fetches it again, filtered to what this screen's role may see.
// Changes go to the server and resolve when it has saved them.
//
// The customer's sign-in and phone number stay on the device (the preview
// sign-in until real Google login), through `local`, a browser-store repo.
import { EMPTY_EDITS } from "../menuEdits";
import { readCards } from "../loyalty";
import { readSheets } from "../expenses";
import { readPromotions } from "../promotions";
import { readSettings } from "../settings";
import { TOPICS } from "./repo";

const MY_ORDERS_KEY = "fc_my_orders";
const MAX_MY_ORDERS = 50;
const RETRY_MS = [1000, 2000, 5000, 10_000, 30_000];
const PING_MS = 25_000;
const POLL_MS = 20_000; // only without a socket
const FETCH_RETRY_MS = [2000, 5000, 10_000, 30_000];
const REQUEST_REUSE_MS = 10 * 60_000; // a retried order within this keeps its request id
const OFFLINE = "We couldn't reach the shop. Check your connection and try again.";

const SERVER_TOPICS = new Set([TOPICS.orders, TOPICS.settings, TOPICS.menu, TOPICS.locations, TOPICS.staff, TOPICS.shifts, TOPICS.cards, TOPICS.promotions, TOPICS.stampTokens, TOPICS.expenses]);
const topicOf = (name) => TOPICS[name] ?? name;

/**
 * @param {{ local: object, storage: Storage, fetcher?: typeof fetch,
 *   openSocket?: ((url: string) => WebSocket) | null, origin: string,
 *   onVisible?: (fn: () => void) => void }} deps
 */
export function createCloudRepo({ local, storage, fetcher = fetch, openSocket = null, origin, onVisible = null }) {
  const cache = new Map();
  const listeners = new Map(); // topic -> Set<fn>
  const queued = new Set();
  let flushTimer = null;
  let staffRole = null; // "admin" | "driver" | "clock" once a staff screen has signed in
  let cardId = null;
  const watchedOrders = new Set();
  let lastLogin = null; // the clock pad's last good Staff ID and PIN, for the punch that follows
  // Each topic's latest request; an older answer arriving later is dropped.
  const generation = new Map();
  let fetchFailures = 0;
  let retryTimer = null;
  let lastOrderAttempt = null; // { signature, requestId, at }

  const readJson = (key, fallback) => {
    try {
      return JSON.parse(storage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const myOrders = () => {
    const saved = readJson(MY_ORDERS_KEY, []);
    return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
  };
  const rememberOrder = (id) => {
    try {
      storage.setItem(MY_ORDERS_KEY, JSON.stringify([...myOrders().filter((x) => x !== id), id].slice(-MAX_MY_ORDERS)));
    } catch {
      watchedOrders.add(id); // Blocked storage: followed for this visit.
    }
  };

  const emit = (topic) => listeners.get(topic)?.forEach((fn) => fn());

  async function request(path, init) {
    let response;
    try {
      response = await fetcher(`${origin}${path}`, { credentials: "same-origin", ...init });
    } catch {
      throw new Error(OFFLINE);
    }
    const body = await response.json().catch(() => null);
    if (!body?.ok) {
      const error = new Error(body?.error ?? OFFLINE);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function fetchTopics(topics) {
    const params = new URLSearchParams({ topics: topics.join(",") });
    // A link being followed goes first, so the server's cap never drops it.
    const orders = [...new Set([...watchedOrders, ...myOrders().reverse()])];
    if (orders.length) params.set("orders", orders.join(","));
    if (cardId) params.set("card", cardId);
    if (staffRole) params.set("as", staffRole);
    const asked = new Map(topics.map((t) => [t, (generation.get(t) ?? 0) + 1]));
    asked.forEach((gen, t) => generation.set(t, gen));
    const { data } = await request(`/api/shop/state?${params}`);
    for (const [topic, value] of Object.entries(data)) {
      if (generation.get(topic) !== asked.get(topic)) continue; // a newer request is on its way
      cache.set(topic, value);
      emit(topic);
    }
  }

  // Many screens subscribe at once on load; one request fetches them all.
  function refresh(topics) {
    topics.forEach((t) => SERVER_TOPICS.has(t) && queued.add(t));
    if (flushTimer || queued.size === 0) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const batch = [...queued];
      queued.clear();
      fetchTopics(batch).then(
        () => {
          fetchFailures = 0;
        },
        () => {
          // Offline or a hiccup: the cache keeps what it had; try again soon.
          const wait = FETCH_RETRY_MS[Math.min(fetchFailures, FETCH_RETRY_MS.length - 1)];
          fetchFailures += 1;
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => refresh(batch.filter((t) => listeners.get(t)?.size)), wait);
        }
      );
    }, 0);
  }

  // A topic nobody shows right now is dropped when it changes, so the next
  // screen to show it loads it fresh instead of showing the old copy.
  function onChanged(topics) {
    for (const topic of topics) {
      if (listeners.get(topic)?.size) refresh([topic]);
      else cache.delete(topic);
    }
  }
  const refreshLoaded = () => refresh([...listeners.keys()].filter((t) => listeners.get(t).size > 0));

  // The live socket, opened with the first subscription and reopened after drops.
  let socket = null;
  let attempt = 0;
  let pingTimer = null;
  function connect() {
    if (!openSocket) {
      if (!pingTimer) pingTimer = setInterval(refreshLoaded, POLL_MS);
      return;
    }
    if (socket) return;
    try {
      socket = openSocket(`${origin.replace(/^http/, "ws")}/api/shop/live`);
    } catch {
      socket = null;
      setTimeout(connect, RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
      attempt += 1;
      return;
    }
    socket.onopen = () => {
      attempt = 0;
      refreshLoaded(); // anything missed while away
      clearInterval(pingTimer);
      pingTimer = setInterval(() => socket?.readyState === 1 && socket.send("ping"), PING_MS);
    };
    socket.onmessage = (event) => {
      try {
        const { changed } = JSON.parse(event.data);
        if (Array.isArray(changed)) onChanged(changed);
      } catch {
        // "pong" and anything else that is not a change notice.
      }
    };
    socket.onclose = () => {
      socket = null;
      clearInterval(pingTimer);
      pingTimer = null;
      setTimeout(connect, RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
      attempt += 1;
    };
  }
  onVisible?.(() => {
    refreshLoaded();
    connect();
  });

  async function call(method, ...args) {
    const body = await request("/api/shop/call", {
      method: "POST",
      headers: { "content-type": "application/json", "x-flexchicken": "1" },
      body: JSON.stringify({ method, args, as: staffRole ?? undefined }),
    });
    if (Array.isArray(body.changed)) onChanged(body.changed);
    return body.data;
  }

  const read = (topic, fallback) => (cache.has(topic) ? cache.get(topic) : fallback);
  const listOrders = () => read(TOPICS.orders, []);

  return {
    subscribe(name, fn) {
      const topic = topicOf(name);
      if (!SERVER_TOPICS.has(topic)) return local.subscribe(name, fn);
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      const set = listeners.get(topic);
      // The first screen to show a topic asks for it, cached or not: the
      // copy may be from before this screen opened.
      if (set.size === 0) refresh([topic]);
      set.add(fn);
      connect();
      return () => set.delete(fn);
    },
    /** False until a server topic's first answer, so screens do not show "nothing" while loading. */
    isReady: (name) => !SERVER_TOPICS.has(topicOf(name)) || cache.has(topicOf(name)),
    /** Fetches these topics again, dropping the copy held (after the order list PIN opens them). */
    reload(names) {
      const topics = names.map(topicOf);
      topics.forEach((t) => {
        cache.delete(t);
        generation.set(t, (generation.get(t) ?? 0) + 1);
        emit(t);
      });
      refresh(topics);
    },
    /** A staff screen's role, after its sign-in; the cache fetches again as that role. */
    setStaffRole(role) {
      if (role === staffRole) return;
      staffRole = role;
      cache.clear();
      // Answers already on their way were for the old role.
      for (const topic of SERVER_TOPICS) generation.set(topic, (generation.get(topic) ?? 0) + 1);
      refreshLoaded();
    },

    listOrders,
    getOrder(id) {
      if (typeof id === "string" && !watchedOrders.has(id) && !myOrders().includes(id)) {
        watchedOrders.add(id);
        refresh([TOPICS.orders, TOPICS.locations]);
      }
      return listOrders().find((o) => o.id === id) ?? null;
    },
    ordersFor: (customerId) => listOrders().filter((o) => o.customer.id === customerId),
    async placeOrder(input) {
      // The same Box sent again after a lost answer keeps its request id, so
      // the server hands back the order it already made instead of a second one.
      const signature = JSON.stringify([input?.cart, input?.mode, input?.address, input?.customer?.id]);
      const reuse = lastOrderAttempt && lastOrderAttempt.signature === signature && Date.now() - lastOrderAttempt.at < REQUEST_REUSE_MS;
      const requestId = reuse ? lastOrderAttempt.requestId : `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      lastOrderAttempt = { signature, requestId, at: Date.now() };
      const order = await call("placeOrder", { ...input, requestId });
      lastOrderAttempt = null;
      rememberOrder(order.id);
      // Show it at once where orders are already loaded; elsewhere the first
      // load fetches it with this device's other orders.
      if (cache.has(TOPICS.orders)) {
        cache.set(TOPICS.orders, [...listOrders().filter((o) => o.id !== order.id), order]);
        emit(TOPICS.orders);
      }
      return order;
    },
    advance: (id, status, extra = {}) => call("advance", id, status, extra),

    getSettings: () => readSettings(read(TOPICS.settings, null)),
    saveSettings: (patch) => call("saveSettings", patch),
    getMenuEdits: () => ({ ...EMPTY_EDITS, ...read(TOPICS.menu, {}) }),
    async saveMenuEdits(edits) {
      // The server answers with the edits as saved: show them at once, so the
      // next change is made on top of this one.
      const saved = await call("saveMenuEdits", edits);
      cache.set(TOPICS.menu, saved);
      emit(TOPICS.menu);
    },

    getSession: () => local.getSession(),
    signIn: (input) => local.signIn(input),
    signOut: () => local.signOut(),
    updateProfile: (input) => local.updateProfile(input),

    listStaff: () => read(TOPICS.staff, []),
    listShifts: () => read(TOPICS.shifts, []),
    addStaff: (input) => call("addStaff", input),
    updateStaff: (id, patch) => call("updateStaff", id, patch),
    removeStaff: (id) => call("removeStaff", id),
    async identify(code, pin) {
      const found = await call("identify", code, pin);
      lastLogin = [code, pin];
      return found;
    },
    async clockIn() {
      if (!lastLogin) throw new Error("Enter your Staff ID and PIN again.");
      const login = lastLogin;
      lastLogin = null;
      return call("clockInWithPin", ...login);
    },
    async clockOut(staffId, closedBy = null) {
      if (closedBy === "manager") return call("clockOut", staffId);
      if (!lastLogin) throw new Error("Enter your Staff ID and PIN again.");
      const login = lastLogin;
      lastLogin = null;
      return call("clockOutWithPin", ...login);
    },
    correctShift: (shiftId, times) => call("correctShift", shiftId, times),

    listCards: () => readCards(read(TOPICS.cards, [])),
    getCard(id) {
      if (typeof id === "string" && id !== cardId) {
        cardId = id;
        refresh([TOPICS.cards]);
      }
      return readCards(read(TOPICS.cards, [])).find((c) => c.id === id) ?? null;
    },
    async registerCard(input) {
      if (typeof input?.id === "string") cardId = input.id;
      return call("registerCard", input);
    },
    stampCard: (id, by) => call("stampCard", id, by),
    unstampCard: (id, by) => call("unstampCard", id, by),
    redeemCard: (id, by) => call("redeemCard", id, by),
    renameCard: (id, name) => call("renameCard", id, name),
    removeCard: (id) => call("removeCard", id),
    issueStampToken: (orderId) => call("issueStampToken", orderId),
    async redeemStampToken(token, id) {
      cardId = id;
      return call("redeemStampToken", token, id);
    },

    listPromotions: () => readPromotions(read(TOPICS.promotions, [])),
    savePromotion: (input) => call("savePromotion", input),
    removePromotion: (id) => call("removePromotion", id),

    listExpenseSheets: () => readSheets(read(TOPICS.expenses, [])),
    saveExpenseSheet: (input) => call("saveExpenseSheet", input),
    removeExpenseSheet: (id) => call("removeExpenseSheet", id),

    getLocation(orderId) {
      if (typeof orderId === "string" && !watchedOrders.has(orderId) && !myOrders().includes(orderId)) {
        watchedOrders.add(orderId);
        refresh([TOPICS.locations]);
      }
      return read(TOPICS.locations, {})[orderId] ?? null;
    },
    pushLocation: (orderId, point) => call("pushLocation", orderId, point),
  };
}
