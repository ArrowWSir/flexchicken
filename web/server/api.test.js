import { describe, expect, test, vi } from "vitest";
import { createApi } from "./api";
import { createShopCore } from "./shopCore";

function memoryStore() {
  const data = new Map();
  return {
    read: (key, fallback) => (data.has(key) ? data.get(key) : fallback),
    write: (key, value) => data.set(key, value),
    savePhoto: () => "/api/photo/x.webp",
    readPhoto: (id) => (id === "ph_1" ? { type: "image/webp", data: new Uint8Array([1, 2]) } : null),
  };
}

const ENV = { ADMIN_PIN: "73519046", DRIVER_PIN: "26480157", SESSION_SECRET: "a-test-secret-that-is-at-least-32-chars" };
const ORIGIN = "https://shop.test";

function setup(env = ENV) {
  const store = memoryStore();
  let n = 0;
  const newId = (p) => `${p}_${++n}`;
  const core = createShopCore({ store, newId, savePhoto: store.savePhoto, fetcher: async () => ({ ok: false, json: async () => ({}) }) });
  const broadcast = vi.fn();
  const api = createApi({ core, store, env, broadcast, now: () => 1_000_000 });
  return { api, broadcast, store };
}

const post = (path, body, { cookie = "", headers = {}, ip = "9.9.9.9" } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-flexchicken": "1", origin: ORIGIN, cookie, "cf-connecting-ip": ip, ...headers },
    body: JSON.stringify(body),
  });
const get = (path, cookie = "") => new Request(`${ORIGIN}${path}`, { headers: { cookie } });

async function signIn(api, role, pin, name, ip) {
  const res = await api.handle(post("/api/staff/login", { role, pin, name }, { ip }));
  const cookie = res.headers.get("set-cookie");
  return { res, cookie: cookie?.split(";")[0] ?? "" };
}

describe("staff sign-in", () => {
  test("the right code sets an HttpOnly cookie and the role works", async () => {
    const { api } = setup();
    const { res, cookie } = await signIn(api, "admin", "73519046");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/fc_admin=.+HttpOnly/);
    const me = await (await api.handle(get("/api/staff/me?as=admin", cookie))).json();
    expect(me.data).toMatchObject({ role: "admin", name: "Kitchen" });
    const saved = await api.handle(post("/api/shop/call", { method: "saveSettings", args: [{ prepMinutes: 30 }], as: "admin" }, { cookie }));
    expect(saved.status).toBe(200);
  });

  test("a wrong code is refused, and too many lock the caller out", async () => {
    const { api } = setup();
    for (let i = 0; i < 5; i += 1) expect((await signIn(api, "admin", "000000")).res.status).toBe(401);
    expect((await signIn(api, "admin", "73519046")).res.status).toBe(429);
  });

  test("many wrong codes from many places pause sign-in for everyone", async () => {
    const { api } = setup();
    for (let i = 0; i < 31; i += 1) await signIn(api, "admin", "000000", undefined, `10.0.0.${i}`);
    expect((await signIn(api, "admin", "73519046", undefined, "10.9.9.9")).res.status).toBe(429);
  });

  test("drivers give their name, which becomes their identity", async () => {
    const { api } = setup();
    expect((await signIn(api, "driver", "26480157", " ")).res.status).toBe(400);
    const { cookie } = await signIn(api, "driver", "26480157", "Sam Jones");
    const me = await (await api.handle(get("/api/staff/me?as=driver", cookie))).json();
    expect(me.data).toMatchObject({ role: "driver", id: "drv_sam-jones", name: "Sam Jones" });
  });

  test("a driver's cookie is not an admin's", async () => {
    const { api } = setup();
    const { cookie } = await signIn(api, "driver", "26480157", "Sam");
    const res = await api.handle(post("/api/shop/call", { method: "saveSettings", args: [{}], as: "admin" }, { cookie: cookie.replace("fc_driver", "fc_admin") }));
    expect(res.status).toBe(403);
  });

  test("is closed until the codes are set as secrets", async () => {
    const { api } = setup({ SESSION_SECRET: ENV.SESSION_SECRET });
    expect((await signIn(api, "admin", "")).res.status).toBe(503);
  });

  test("signing out clears the cookie", async () => {
    const { api } = setup();
    const res = await api.handle(post("/api/staff/logout", { role: "admin" }));
    expect(res.headers.get("set-cookie")).toMatch(/fc_admin=; .*Max-Age=0/);
  });
});

describe("the staff screen's sign-in", () => {
  const change = (api, cookie, body) => api.handle(post("/api/staff/code", { as: "admin", ...body }, { cookie }));

  test("STAFF_PIN opens the staff screen, which runs orders but not the shop", async () => {
    const { api } = setup({ ...ENV, STAFF_PIN: "35792468" });
    const { res, cookie } = await signIn(api, "staff", "35792468");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/fc_staff=.+HttpOnly/);
    expect((await (await api.handle(get("/api/staff/me?as=staff", cookie))).json()).data).toMatchObject({ role: "staff", name: "Staff" });
    const settings = await api.handle(post("/api/shop/call", { method: "saveSettings", args: [{ prepMinutes: 30 }], as: "staff" }, { cookie }));
    expect(settings.status).toBe(403);
    // A staff cookie is not an owner's.
    expect((await (await api.handle(get("/api/staff/me?as=admin", cookie))).json()).data).toBeNull();
  });

  test("is closed until the owner sets a staff code in the admin", async () => {
    const { api } = setup();
    expect((await signIn(api, "staff", "35792468")).res.status).toBe(503);
    const owner = await signIn(api, "admin", "73519046");
    expect((await change(api, owner.cookie, { role: "staff", current: "73519046", next: "35792468" })).status).toBe(200);
    expect((await signIn(api, "staff", "35792468")).res.status).toBe(200);
  });

  test("the staff code and the owner's code must differ, so staff never learn the owner's", async () => {
    const { api } = setup({ ...ENV, STAFF_PIN: "35792468" });
    const owner = await signIn(api, "admin", "73519046");
    const asStaff = await change(api, owner.cookie, { role: "staff", current: "73519046", next: "73519046" });
    expect(asStaff.status).toBe(400);
    expect((await asStaff.json()).error).toMatch(/owner's code/);
    const asOwner = await change(api, owner.cookie, { role: "admin", current: "73519046", next: "35792468" });
    expect(asOwner.status).toBe(400);
    expect((await asOwner.json()).error).toMatch(/staff code/);
  });

  test("only the owner changes the staff code", async () => {
    const { api } = setup({ ...ENV, STAFF_PIN: "35792468" });
    const staff = await signIn(api, "staff", "35792468");
    const res = await api.handle(post("/api/staff/code", { as: "staff", role: "staff", current: "35792468", next: "12345678" }, { cookie: staff.cookie }));
    expect(res.status).toBe(403);
  });
});

describe("changing a shift code from the admin screen", () => {
  const change = (api, cookie, body, ip) => api.handle(post("/api/staff/code", { as: "admin", ...body }, { cookie, ip }));

  test("the owner sets a new admin code; the old one stops working", async () => {
    const { api } = setup();
    const { cookie } = await signIn(api, "admin", "73519046");
    const res = await change(api, cookie, { role: "admin", current: "73519046", next: "48151623" });
    expect(res.status).toBe(200);
    // This device stays signed in with a fresh cookie.
    const fresh = res.headers.get("set-cookie").split(";")[0];
    const me = await (await api.handle(get("/api/staff/me?as=admin", fresh))).json();
    expect(me.data).toMatchObject({ role: "admin" });
    // Other devices with the old cookie are signed out.
    const old = await (await api.handle(get("/api/staff/me?as=admin", cookie))).json();
    expect(old.data).toBeNull();
    expect((await signIn(api, "admin", "73519046")).res.status).toBe(401);
    expect((await signIn(api, "admin", "48151623")).res.status).toBe(200);
    // The clock tablet is unlocked with the new owner's code too.
    expect((await signIn(api, "clock", "48151623")).res.status).toBe(200);
  });

  test("the owner sets a new driver code and drivers sign in again", async () => {
    const { api } = setup();
    const { cookie } = await signIn(api, "admin", "73519046");
    const driver = await signIn(api, "driver", "26480157", "Sam");
    expect((await change(api, cookie, { role: "driver", current: "73519046", next: "11223344" })).status).toBe(200);
    expect((await (await api.handle(get("/api/staff/me?as=driver", driver.cookie))).json()).data).toBeNull();
    expect((await signIn(api, "driver", "26480157", "Sam")).res.status).toBe(401);
    expect((await signIn(api, "driver", "11223344", "Sam")).res.status).toBe(200);
  });

  test("needs the current owner's code, like a password change", async () => {
    const { api } = setup();
    const { cookie } = await signIn(api, "admin", "73519046");
    expect((await change(api, cookie, { role: "admin", current: "00000000", next: "48151623" })).status).toBe(401);
    expect((await signIn(api, "admin", "73519046")).res.status).toBe(200);
  });

  test("only the owner can change codes", async () => {
    const { api } = setup();
    const driver = await signIn(api, "driver", "26480157", "Sam");
    const res = await api.handle(post("/api/staff/code", { as: "driver", role: "driver", current: "26480157", next: "12345678" }, { cookie: driver.cookie }));
    expect(res.status).toBe(403);
    expect((await change(api, "", { role: "admin", current: "73519046", next: "12345678" })).status).toBe(403);
  });

  test("checks the new code", async () => {
    const { api } = setup();
    const { cookie } = await signIn(api, "admin", "73519046");
    for (const next of ["123", "12a456", "123456789", ""]) {
      expect((await change(api, cookie, { role: "admin", current: "73519046", next })).status).toBe(400);
    }
    // The two screens cannot share a code.
    const same = await change(api, cookie, { role: "admin", current: "73519046", next: "26480157" });
    expect(same.status).toBe(400);
    expect((await same.json()).error).toMatch(/driver/);
  });

  test("keeps only a hash of the code", async () => {
    const { api, store } = setup();
    const { cookie } = await signIn(api, "admin", "73519046");
    await change(api, cookie, { role: "admin", current: "73519046", next: "48151623" });
    expect(JSON.stringify(store.read("staff_codes", {}))).not.toContain("48151623");
  });
});

describe("the order list's own PIN", () => {
  const unlock = (api, cookie, pin, ip) => api.handle(post("/api/staff/list", { as: "admin", pin }, { cookie, ip }));
  const listCall = (api, cookie) =>
    api.handle(post("/api/shop/call", { method: "saveExpenseSheet", args: [{ date: "2026-10-09", lines: [{ item: "Wings", qty: "10 kg" }] }], as: "admin" }, { cookie }));
  const cookieOf = (res) => res.headers.get("set-cookie").split(";")[0];

  test("opens with 0000 until changed, on top of the owner's sign-in", async () => {
    const { api } = setup();
    const admin = await signIn(api, "admin", "73519046");
    expect((await listCall(api, admin.cookie)).status).toBe(403);
    expect((await unlock(api, "", "0000")).status).toBe(403);
    const wrong = await unlock(api, admin.cookie, "1234");
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error).toBe("That PIN is not right.");
    const res = await unlock(api, admin.cookie, "0000");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/fc_list=.+HttpOnly/);
    const both = `${admin.cookie}; ${cookieOf(res)}`;
    expect((await listCall(api, both)).status).toBe(200);
    // The list cookie alone is not enough.
    expect((await listCall(api, cookieOf(res))).status).toBe(403);
    const locked = await api.handle(post("/api/staff/list-lock", {}, { cookie: both }));
    expect(locked.headers.get("set-cookie")).toMatch(/fc_list=; .*Max-Age=0/);
  });

  test("LIST_PIN replaces the default", async () => {
    const { api } = setup({ ...ENV, LIST_PIN: "4321" });
    const admin = await signIn(api, "admin", "73519046");
    expect((await unlock(api, admin.cookie, "0000")).status).toBe(401);
    expect((await unlock(api, admin.cookie, "4321")).status).toBe(200);
  });

  test("changes like a password; other devices must type the new PIN", async () => {
    const { api, store } = setup();
    const admin = await signIn(api, "admin", "73519046");
    const other = cookieOf(await unlock(api, admin.cookie, "0000"));
    const change = (current, next) => api.handle(post("/api/staff/code", { as: "admin", role: "list", current, next }, { cookie: admin.cookie }));
    const wrong = await change("9999", "2468");
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error).toBe("The current PIN is not right.");
    const res = await change("0000", "2468");
    expect(res.status).toBe(200);
    expect(JSON.stringify(store.read("staff_codes", {}))).not.toContain("2468");
    // This device keeps the list open; a device opened with the old PIN does not.
    expect((await listCall(api, `${admin.cookie}; ${cookieOf(res)}`)).status).toBe(200);
    expect((await listCall(api, `${admin.cookie}; ${other}`)).status).toBe(403);
    expect((await unlock(api, admin.cookie, "0000")).status).toBe(401);
    expect((await unlock(api, admin.cookie, "2468")).status).toBe(200);
    // A forgotten PIN is reset with the owner's code; the owner's code is untouched.
    expect((await change("73519046", "1357")).status).toBe(200);
    expect((await unlock(api, admin.cookie, "1357")).status).toBe(200);
    expect((await signIn(api, "admin", "73519046")).res.status).toBe(200);
  });
});

describe("moving the shop to another account", () => {
  test("the owner exports every row and loads it into an empty shop", async () => {
    const store = { ...memoryStore(), dump: () => ({ version: 1, kv: [{ key: "settings", value: "{}" }], items: [], photos: [] }), restore: vi.fn(() => ({ kv: 1, items: 0, photos: 0 })) };
    const core = createShopCore({ store, newId: (p) => `${p}_1`, savePhoto: () => "" });
    const api = createApi({ core, store, env: ENV, broadcast: () => {} });
    const { cookie } = await signIn(api, "admin", "73519046");
    const res = await api.handle(get("/api/admin/export?as=admin", cookie));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.kv).toHaveLength(1);
    const loaded = await api.handle(post("/api/admin/import", { as: "admin", dump: data }, { cookie }));
    expect(loaded.status).toBe(200);
    expect(store.restore).toHaveBeenCalledWith(data);
  });

  test("only the owner may export or import", async () => {
    const { api } = setup();
    expect((await api.handle(get("/api/admin/export"))).status).toBe(403);
    const driver = await signIn(api, "driver", "26480157", "Sam");
    expect((await api.handle(get("/api/admin/export?as=driver", driver.cookie))).status).toBe(403);
    expect((await api.handle(post("/api/admin/import", { as: "admin", dump: {} }))).status).toBe(403);
  });
});

describe("shop calls", () => {
  test("customers are refused staff actions", async () => {
    const { api } = setup();
    const res = await api.handle(post("/api/shop/call", { method: "saveSettings", args: [{}] }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Staff only/);
  });

  test("a change is announced to every open screen", async () => {
    const { api, broadcast } = setup();
    const { cookie } = await signIn(api, "admin", "73519046");
    await api.handle(post("/api/shop/call", { method: "saveSettings", args: [{ prepMinutes: 30 }], as: "admin" }, { cookie }));
    expect(broadcast).toHaveBeenCalledWith(["settings"]);
  });

  test("refuses calls from other sites", async () => {
    const { api } = setup();
    expect((await api.handle(post("/api/shop/call", { method: "identify", args: ["1"] }, { headers: { "x-flexchicken": "" } }))).status).toBe(403);
    expect((await api.handle(post("/api/shop/call", { method: "identify", args: ["1"] }, { headers: { origin: "https://evil.test" } }))).status).toBe(403);
  });

  test("refuses an oversized request", async () => {
    const { api } = setup();
    const res = await api.handle(post("/api/shop/call", { method: "identify", args: ["x".repeat(4_000_000)] }));
    expect(res.status).toBe(413);
  });

  test("the clock pad needs the clock tablet's sign-in, and locks after wrong PINs", async () => {
    const { api } = setup();
    expect((await api.handle(post("/api/shop/call", { method: "identify", args: ["1234"] }))).status).toBe(403);
    const { cookie } = await signIn(api, "clock", "73519046");
    const identify = () => api.handle(post("/api/shop/call", { method: "identify", args: ["1234"], as: "clock" }, { cookie }));
    for (let i = 0; i < 5; i += 1) expect((await identify()).status).toBe(400);
    expect((await identify()).status).toBe(429);
  });

  test("a changed shift code signs out devices that used the old one", async () => {
    const { api } = setup();
    const { cookie } = await signIn(api, "admin", "73519046");
    const rotated = setup({ ...ENV, ADMIN_PIN: "99887766" }).api;
    const me = await (await rotated.handle(get("/api/staff/me?as=admin", cookie))).json();
    expect(me.data).toBeNull();
  });

  test("limits how many orders one caller can place", async () => {
    const { api } = setup();
    const order = () => api.handle(post("/api/shop/call", { method: "placeOrder", args: [{ cart: { lines: [] }, mode: "collection" }] }));
    for (let i = 0; i < 10; i += 1) expect((await order()).status).toBe(400);
    expect((await order()).status).toBe(429);
  });

  test("caps a customer's request far below the menu's", async () => {
    const { api } = setup();
    const res = await api.handle(post("/api/shop/call", { method: "placeOrder", args: [{ note: "x".repeat(70_000) }] }));
    expect(res.status).toBe(413);
  });

  test("hides what went wrong inside the server", async () => {
    const core = { usesPin: () => false, call: async () => { throw new TypeError("secret detail at row 7"); } };
    const api = createApi({ core, store: memoryStore(), env: ENV, broadcast: () => {} });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await api.handle(post("/api/shop/call", { method: "placeOrder", args: [] }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("reading the shop", () => {
  test("returns the topics asked for, as the caller's role sees them", async () => {
    const { api } = setup();
    const res = await api.handle(get("/api/shop/state?topics=settings,staff,nope"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Object.keys(body.data)).toEqual(["settings", "staff"]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("serves a stored photo for a long time", async () => {
    const { api } = setup();
    const res = await api.handle(get("/api/photo/ph_1.webp"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toMatch(/immutable/);
    expect((await api.handle(get("/api/photo/nope.webp"))).status).toBe(404);
    expect((await api.handle(get("/api/photo/../../x"))).status).toBe(404);
  });

  test("anything else is not found", async () => {
    const { api } = setup();
    expect((await api.handle(get("/api/other"))).status).toBe(404);
  });
});

describe("the network receipt printer", () => {
  const form = (key, body, { ip = "7.7.7.7", id = "" } = {}) =>
    new Request(`${ORIGIN}/api/printer${key === null ? "" : `?key=${encodeURIComponent(key)}`}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip },
      body: new URLSearchParams({ ID: id, ...body }).toString(),
    });

  async function printerKey(api) {
    const { cookie } = await signIn(api, "admin", "73519046");
    const res = await api.handle(post("/api/shop/call", { method: "printerLink", args: [], as: "admin" }, { cookie }));
    return { key: (await res.json()).data.key, cookie };
  }

  test("with the right key, an empty answer means nothing to print", async () => {
    const { api } = setup();
    const { key } = await printerKey(api);
    const res = await api.handle(form(key, { ConnectionType: "GetRequest" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/xml; charset=utf-8");
    expect(await res.text()).toBe("");
  });

  test("the key also works pasted as the printer's ID", async () => {
    const { api } = setup();
    const { key } = await printerKey(api);
    expect((await api.handle(form(null, { ConnectionType: "GetRequest" }, { id: key }))).status).toBe(200);
  });

  test("hands the owner's test slip over, then takes the result", async () => {
    const { api, broadcast } = setup();
    const { key, cookie } = await printerKey(api);
    await api.handle(post("/api/shop/call", { method: "printTestReceipt", args: [], as: "admin" }, { cookie }));
    const slip = await (await api.handle(form(key, { ConnectionType: "GetRequest" }))).text();
    expect(slip).toContain("<PrintRequestInfo>");
    expect(slip).toContain("PRINTER TEST");
    expect(broadcast).toHaveBeenCalledWith(["printer"]);
    const result = '<PrintResponseInfo><response success="true" code="" status="1"/></PrintResponseInfo>';
    const res = await api.handle(form(key, { ConnectionType: "SetResponse", ResponseFile: result }));
    expect(res.status).toBe(200);
  });

  test("refuses a wrong key and slows a caller who keeps guessing, but never the real printer", async () => {
    const { api } = setup();
    const { key } = await printerKey(api);
    expect((await api.handle(form("wrong", { ConnectionType: "GetRequest" }))).status).toBe(403);
    for (let i = 0; i < 9; i += 1) await api.handle(form("wrong", { ConnectionType: "GetRequest" }));
    expect((await api.handle(form("wrong", { ConnectionType: "GetRequest" }))).status).toBe(429);
    // Same address (the shop's guest Wi-Fi, say): the printer's key still works.
    expect((await api.handle(form(key, { ConnectionType: "GetRequest" }))).status).toBe(200);
  });

  test("refuses everything before the owner has made a link", async () => {
    const { api } = setup();
    expect((await api.handle(form("", { ConnectionType: "GetRequest" }))).status).toBe(403);
  });

  test("refuses a request it does not know", async () => {
    const { api } = setup();
    const { key } = await printerKey(api);
    expect((await api.handle(form(key, { ConnectionType: "Status" }))).status).toBe(400);
  });
});
