import { describe, expect, test, vi } from "vitest";
import { createCloudRepo } from "./cloud";
import { createLocalStore } from "./local";
import { createRepo } from "./repo";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

// A stand-in server: answers state and call requests from `state`.
function fakeServer(state = {}) {
  const requests = [];
  const fetcher = vi.fn(async (url, init = {}) => {
    const u = new URL(url);
    requests.push({ path: u.pathname, params: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : null, headers: init.headers ?? {} });
    if (u.pathname === "/api/shop/state") {
      const topics = u.searchParams.get("topics").split(",");
      const data = Object.fromEntries(topics.filter((t) => t in state).map((t) => [t, state[t]]));
      return { status: 200, json: async () => ({ ok: true, data, error: null }) };
    }
    const { method, args } = JSON.parse(init.body);
    if (method === "placeOrder") return { status: 200, json: async () => ({ ok: true, data: { id: "ord_x1", customer: { id: "u1" } }, changed: ["orders"] }) };
    if (method === "saveSettings") return { status: 403, json: async () => ({ ok: false, data: null, error: "Staff only. Sign in again." }) };
    return { status: 200, json: async () => ({ ok: true, data: { method, args }, changed: [] }) };
  });
  return { fetcher, requests };
}

function fakeSocket() {
  const sockets = [];
  const openSocket = (url) => {
    const socket = { url, readyState: 1, sent: [], send: (m) => socket.sent.push(m), onopen: null, onmessage: null, onclose: null };
    sockets.push(socket);
    return socket;
  };
  return { openSocket, sockets };
}

function setup(state, { socket = true } = {}) {
  const storage = memoryStorage();
  const server = fakeServer(state);
  const sockets = fakeSocket();
  const local = createRepo(createLocalStore({ storage }));
  const repo = createCloudRepo({ local, storage, fetcher: server.fetcher, openSocket: socket ? sockets.openSocket : null, origin: "https://shop.test" });
  return { repo, server, sockets, storage };
}

describe("cloud repo", () => {
  test("loads a topic on first subscribe and is not ready before", async () => {
    const { repo, server } = setup({ settings: { prepMinutes: 35 } });
    const heard = vi.fn();
    repo.subscribe("settings", heard);
    expect(repo.isReady("settings")).toBe(false);
    await flush();
    expect(repo.isReady("settings")).toBe(true);
    expect(repo.getSettings().prepMinutes).toBe(35);
    expect(heard).toHaveBeenCalled();
    expect(server.requests[0].params.topics).toBe("settings");
  });

  test("fetches screens' topics together in one request", async () => {
    const { repo, server } = setup({ settings: {}, promotions: [], menu_edits: {} });
    repo.subscribe("settings", () => {});
    repo.subscribe("promotions", () => {});
    repo.subscribe("menu", () => {});
    await flush();
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].params.topics.split(",").sort()).toEqual(["menu_edits", "promotions", "settings"]);
  });

  test("fetches again when the socket says a topic changed", async () => {
    const state = { orders: [] };
    const { repo, server, sockets } = setup(state);
    repo.subscribe("orders", () => {});
    await flush();
    state.orders = [{ id: "o1", customer: { id: "u" } }];
    sockets.sockets[0].onmessage({ data: JSON.stringify({ changed: ["orders", "staff"] }) });
    await flush();
    expect(repo.listOrders().map((o) => o.id)).toEqual(["o1"]);
    // staff had no screen listening, so it was not fetched.
    expect(server.requests.at(-1).params.topics).toBe("orders");
  });

  test("polls when the browser has no sockets", async () => {
    vi.useFakeTimers();
    const { repo, server } = setup({ settings: {} }, { socket: false });
    repo.subscribe("settings", () => {});
    await vi.advanceTimersByTimeAsync(20_001);
    expect(server.requests.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  test("remembers the orders this device placed and asks only for those", async () => {
    const { repo, server, storage } = setup({ orders: [] });
    const order = await repo.placeOrder({ cart: {}, customer: {}, mode: "collection" });
    expect(order.id).toBe("ord_x1");
    expect(JSON.parse(storage.getItem("fc_my_orders"))).toEqual(["ord_x1"]);
    expect(repo.isReady("orders")).toBe(false);
    repo.subscribe("orders", () => {});
    await flush();
    expect(server.requests.at(-1).params.orders).toBe("ord_x1");
  });

  test("sends calls as the signed-in staff screen, with the anti-forgery header", async () => {
    const { repo, server } = setup({});
    repo.setStaffRole("admin");
    await repo.stampCard("c1", "staff");
    const last = server.requests.at(-1);
    expect(last.body).toEqual({ method: "stampCard", args: ["c1", "staff"], as: "admin" });
    expect(last.headers["x-flexchicken"]).toBe("1");
  });

  test("turns a refusal into an error with the server's words", async () => {
    const { repo } = setup({});
    await expect(repo.saveSettings({})).rejects.toThrow("Staff only. Sign in again.");
  });

  test("says when the shop cannot be reached", async () => {
    const storage = memoryStorage();
    const local = createRepo(createLocalStore({ storage }));
    const repo = createCloudRepo({ local, storage, fetcher: async () => Promise.reject(new TypeError("Failed to fetch")), origin: "https://shop.test" });
    await expect(repo.addStaff({})).rejects.toThrow(/couldn't reach the shop/);
  });

  test("the clock punches with the Staff ID and PIN it just checked, once", async () => {
    const { repo, server } = setup({});
    await expect(repo.clockIn("s1")).rejects.toThrow(/PIN again/);
    await repo.identify("101", "4821");
    expect(server.requests.at(-1).body).toMatchObject({ method: "identify", args: ["101", "4821"] });
    await repo.clockIn("s1");
    expect(server.requests.at(-1).body).toMatchObject({ method: "clockInWithPin", args: ["101", "4821"] });
    await expect(repo.clockOut("s1")).rejects.toThrow(/PIN again/);
    await repo.clockOut("s1", "manager");
    expect(server.requests.at(-1).body).toMatchObject({ method: "clockOut", args: ["s1"] });
  });

  test("keeps the customer's sign-in on the device", () => {
    const { repo, server } = setup({});
    const session = repo.signIn({ name: "Jo", email: "jo@example.com", provider: "google" });
    expect(repo.getSession()).toEqual(session);
    expect(server.requests).toHaveLength(0);
  });

  test("asks for the card this device holds", async () => {
    const { repo, server } = setup({ loyalty_cards: [] });
    repo.subscribe("cards", () => {});
    repo.getCard("fc_usr_abc");
    await flush();
    expect(server.requests.at(-1).params.card).toBe("fc_usr_abc");
  });

  test("a screen opened again fetches afresh instead of showing an old copy", async () => {
    const state = { orders: [] };
    const { repo, server, sockets } = setup(state);
    const stop = repo.subscribe("orders", () => {});
    await flush();
    stop();
    state.orders = [{ id: "o2", customer: { id: "u" } }];
    sockets.sockets[0].onmessage({ data: JSON.stringify({ changed: ["orders"] }) });
    expect(repo.isReady("orders")).toBe(false);
    repo.subscribe("orders", () => {});
    await flush();
    expect(repo.listOrders().map((o) => o.id)).toEqual(["o2"]);
    expect(server.requests.filter((r) => r.path === "/api/shop/state")).toHaveLength(2);
  });

  test("tries a failed load again by itself", async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const local = createRepo(createLocalStore({ storage }));
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return { status: 200, json: async () => ({ ok: true, data: { settings: { prepMinutes: 40 } } }) };
    };
    const repo = createCloudRepo({ local, storage, fetcher, origin: "https://shop.test", openSocket: () => ({ send() {} }) });
    repo.subscribe("settings", () => {});
    await vi.advanceTimersByTimeAsync(10);
    expect(repo.isReady("settings")).toBe(false);
    await vi.advanceTimersByTimeAsync(2100);
    expect(repo.getSettings().prepMinutes).toBe(40);
    vi.useRealTimers();
  });

  test("an older answer arriving late does not overwrite a newer one", async () => {
    const storage = memoryStorage();
    const local = createRepo(createLocalStore({ storage }));
    const answers = [];
    const fetcher = () => new Promise((resolve) => answers.push(resolve));
    const repo = createCloudRepo({ local, storage, fetcher, origin: "https://shop.test", openSocket: () => ({ send() {} }) });
    repo.subscribe("settings", () => {});
    await flush();
    repo.setStaffRole("admin");
    await flush();
    const reply = (prepMinutes) => ({ status: 200, json: async () => ({ ok: true, data: { settings: { prepMinutes } } }) });
    answers[1](reply(30)); // the admin answer
    await flush();
    answers[0](reply(99)); // the stale customer answer
    await flush();
    expect(repo.getSettings().prepMinutes).toBe(30);
  });

  test("sending the same Box again reuses its request id", async () => {
    const { repo, server } = setup({});
    const ids = [];
    server.fetcher.mockImplementationOnce(async (url, init) => {
      ids.push(JSON.parse(init.body).args[0].requestId);
      throw new TypeError("lost");
    });
    const input = { cart: { lines: [1] }, customer: { id: "u1" }, mode: "collection" };
    await expect(repo.placeOrder(input)).rejects.toThrow(/couldn't reach/);
    await repo.placeOrder(input);
    ids.push(server.requests.at(-1).body.args[0].requestId);
    expect(ids[0]).toMatch(/^req_/);
    expect(ids[1]).toBe(ids[0]);
    // A different Box is a different order.
    await repo.placeOrder({ ...input, mode: "delivery" });
    expect(server.requests.at(-1).body.args[0].requestId).not.toBe(ids[0]);
  });

  test("shows saved menu edits at once", async () => {
    const { repo, server } = setup({ menu_edits: {} });
    server.fetcher.mockImplementationOnce(async () => ({ status: 200, json: async () => ({ ok: true, data: { updated: {}, added: [], removed: [], soldOut: [7] }, changed: [] }) }));
    await repo.saveMenuEdits({ soldOut: [7] });
    expect(repo.getMenuEdits().soldOut).toEqual([7]);
  });
});
