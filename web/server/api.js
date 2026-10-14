// The shop's HTTP API, served from the Durable Object (server/shopObject.js).
// Every answer uses one envelope: { ok, data, error }.
//
//   GET  /api/shop/state?topics=a,b&orders=id,id&card=id&as=admin
//   POST /api/shop/call      { method, args, as }   -> also { changed: topics }
//   POST /api/staff/login    { role, pin, name }
//   POST /api/staff/logout   { role }
//   POST /api/staff/code     { as: "admin", role, current, next }   the owner changes a code
//   POST /api/staff/list     { as: "admin", pin }       opens the order list (its own PIN)
//   POST /api/staff/list-lock                           closes it again
//   GET  /api/admin/export?as=admin                     every row, to move the shop
//   POST /api/admin/import   { as: "admin", dump }      into an empty shop only
//   GET  /api/staff/me?as=admin
//   GET  /api/photo/<id>.<ext>
//   POST /api/printer?key=..  form data from the Epson network printer (server/printQueue.js)
//
// `as` names the staff screen asking (admin, staff: the counter's orders and
// cards, driver, or clock: the shop's clock tablet), so the matching cookie is used; without it the caller is a
// customer. The live socket (/api/shop/live) is handled by the Durable Object.
import { callerKey, codeVersion, cookieFor, createLimiter, createRateLimit, hashCode, newSalt, pinMatches, readCookie, signClaims, verifyClaims } from "./auth.js";
import { ShopError } from "./checks.js";

const KB = 1024;
const MAX_MENU_BODY = 3 * KB * KB; // menu edits carry photos
const MAX_CALL_BODY = 64 * KB;
const MAX_STAFF_BODY = 4 * KB;
const MAX_IMPORT_BODY = 60 * KB * KB;
const MAX_PRINTER_BODY = 32 * KB; // a print result is a few hundred bytes
const STAFF_MAX_AGE_S = 30 * 24 * 3600;
// The order list's own PIN opens it for one working day at most; the screen
// asks for it again on every visit anyway.
const LIST_MAX_AGE_S = 8 * 3600;
const LIST_COOKIE = "fc_list";
// The order list PIN until the owner changes it (or sets LIST_PIN).
const DEFAULT_LIST_CODE = "0000";
const MIN_SECRET_CHARS = 32;
const STAFF_ROLES = new Set(["admin", "staff", "driver", "clock"]);
const PHOTO_PATH = /^\/api\/photo\/([A-Za-z0-9_-]{1,80})\.(webp|jpeg|png)$/;
const MINUTE = 60_000;
// Per caller (IP, or IPv6 /64): a customer orders a few times at most.
const LIMITS = {
  order: { max: 10, windowMs: 10 * MINUTE, message: "That is a lot of orders at once. Please call the shop." },
  card: { max: 30, windowMs: 60 * MINUTE, message: "Too many new cards from here. Try again later." },
};
// Shift codes are digits only (the staff screens show a number pad).
const CODE_SHAPE = /^\d{4,8}$/;
// Where the owner's own codes are kept (hashed); never one of the API's topics.
const CODES = "staff_codes";
// Wrong shift codes across every caller: past this, sign-in pauses for all.
const GLOBAL_LOGIN_FAILS = { max: 30, windowMs: 60 * MINUTE };

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers },
  });
const ok = (data, headers, extra = {}) => json(200, { ok: true, data: data ?? null, error: null, ...extra }, headers);
const fail = (status, error, headers) => json(status, { ok: false, data: null, error }, headers);

const cookieName = (role) => `fc_${role}`;
const driverId = (name) => `drv_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** The request body as text, refusing more than `max` bytes as it streams. */
async function readLimited(request, max) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > max) throw new ShopError(413, "That is too much to send at once.");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new ShopError(413, "That is too much to send at once.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * @param {{ core: ReturnType<import("./shopCore.js").createShopCore>,
 *   store: { readPhoto: Function }, env: Record<string, string>,
 *   broadcast: (topics: string[]) => void, now?: () => number }} deps
 */
export function createApi({ core, store, env, broadcast, now = Date.now }) {
  const pinLimiter = createLimiter({ maxFails: 5, lockMs: 30_000 });
  const printerLimiter = createLimiter({ maxFails: 10, lockMs: 5 * MINUTE });
  const loginLimiter = createLimiter({ maxFails: 5, lockMs: 60_000 });
  const globalLoginFails = createRateLimit(GLOBAL_LOGIN_FAILS);
  let globalLoginPausedUntil = 0;
  const rateLimits = Object.fromEntries(Object.entries(LIMITS).map(([name, l]) => [name, createRateLimit(l)]));
  const secret = typeof env.SESSION_SECRET === "string" && env.SESSION_SECRET.length >= MIN_SECRET_CHARS ? env.SESSION_SECRET : null;
  // Four codes: the owner's (admin screens, and unlocking the clock tablet),
  // the staff screen's (orders and cards), the drivers', and the order list's
  // (a second lock inside the admin). One the owner set in /admin wins; until
  // then the Worker secret stands.
  const keyOf = (role) => (role === "staff" || role === "driver" || role === "list" ? role : "admin");
  const savedCode = (role) => store.read(CODES, {})[keyOf(role)] ?? null;
  const secretCode = (role) => {
    const key = keyOf(role);
    const code = { staff: env.STAFF_PIN, driver: env.DRIVER_PIN, list: env.LIST_PIN, admin: env.ADMIN_PIN }[key];
    if (typeof code === "string" && CODE_SHAPE.test(code)) return code;
    return key === "list" ? DEFAULT_LIST_CODE : null;
  };
  const isSetUp = (role) => Boolean(secret && (savedCode(role) || secretCode(role)));
  async function codeMatches(role, given) {
    if (typeof given !== "string" || !CODE_SHAPE.test(given)) return false;
    const saved = savedCode(role);
    if (saved) return pinMatches(await hashCode(given, saved.salt), saved.hash);
    return pinMatches(given, secretCode(role) ?? "");
  }
  // Cookies carry the version of the code they were issued under, so a new
  // code signs out every device that used the old one.
  const versions = new Map();
  const versionFor = (role) => {
    const key = keyOf(role);
    if (!versions.has(key)) {
      const saved = savedCode(key);
      versions.set(key, saved ? Promise.resolve(saved.hash.slice(0, 16)) : codeVersion(secret, secretCode(key) ?? ""));
    }
    return versions.get(key);
  };
  const issueCookie = async (claims) => {
    const value = await signClaims(secret, { ...claims, v: await versionFor(claims.role) }, now(), STAFF_MAX_AGE_S);
    return cookieFor(cookieName(claims.role), value, STAFF_MAX_AGE_S);
  };

  const callerOf = (request) => callerKey(request.headers.get("cf-connecting-ip"));

  async function actorFor(request, as) {
    const caller = callerOf(request);
    if (!STAFF_ROLES.has(as) || !secret) return { role: "public", ip: caller };
    const claims = await verifyClaims(secret, readCookie(request.headers.get("cookie"), cookieName(as)), now());
    if (!claims || claims.role !== as || claims.v !== (await versionFor(as))) return { role: "public", ip: caller };
    const actor = { role: claims.role, id: claims.id, name: claims.name, ip: caller };
    return claims.role === "admin" ? { ...actor, hasListKey: await hasListKey(request) } : actor;
  }

  // The order list's cookie: good only beside the owner's sign-in, and only
  // under the current order list PIN.
  async function hasListKey(request) {
    const claims = await verifyClaims(secret, readCookie(request.headers.get("cookie"), LIST_COOKIE), now());
    return Boolean(claims && claims.role === "list" && claims.v === (await versionFor("list")));
  }
  const listCookie = async () =>
    cookieFor(LIST_COOKIE, await signClaims(secret, { role: "list", v: await versionFor("list") }, now(), LIST_MAX_AGE_S), LIST_MAX_AGE_S);

  // State-changing calls must come from this site's own pages: a custom
  // header (which other sites cannot send without a CORS preflight) and,
  // when the browser gives one, a matching Origin.
  async function readBody(request, max) {
    const origin = request.headers.get("origin");
    if (request.headers.get("x-flexchicken") !== "1" || (origin && origin !== new URL(request.url).origin)) {
      throw new ShopError(403, "That request was not sent from the shop's own pages.");
    }
    const raw = await readLimited(request, max);
    try {
      const body = JSON.parse(raw);
      if (body && typeof body === "object" && !Array.isArray(body)) return { body, size: raw.length };
    } catch {
      // Falls through to the error below.
    }
    throw new ShopError(400, "That request could not be read.");
  }

  async function shopCall(request) {
    const { body, size } = await readBody(request, MAX_MENU_BODY);
    const { method, args, as } = body;
    if (method !== "saveMenuEdits" && size > MAX_CALL_BODY) throw new ShopError(413, "That is too much to send at once.");
    const actor = await actorFor(request, as);
    const limit = actor.role === "public" ? core.rateLimitOf(method, args) : null;
    if (limit && !rateLimits[limit].hit(actor.ip, now())) return fail(429, LIMITS[limit].message);
    const usesPin = core.usesPin(method);
    if (usesPin) {
      const wait = pinLimiter.waitMs(actor.ip, now());
      if (wait > 0) return fail(429, `Too many wrong PINs. Try again in ${Math.ceil(wait / 1000)} seconds.`);
    }
    try {
      const { result, changed } = await core.call(method, args, actor);
      if (usesPin) pinLimiter.succeed(actor.ip);
      if (changed.length) broadcast(changed);
      // `changed` lets the caller refresh at once, before the socket says so.
      return ok(result, {}, { changed });
    } catch (err) {
      if (usesPin && err?.isWrongPin) pinLimiter.fail(actor.ip, now());
      throw err;
    }
  }

  async function shopState(request, url) {
    const actor = await actorFor(request, url.searchParams.get("as"));
    const list = (name) => (url.searchParams.get(name) ?? "").split(",").filter(Boolean).slice(0, 60);
    const data = core.snapshot(list("topics"), actor, { orderIds: list("orders"), cardId: url.searchParams.get("card") ?? undefined });
    return ok(data);
  }

  async function login(request) {
    const { body } = await readBody(request, MAX_STAFF_BODY);
    const { role, pin, name } = body;
    if (!STAFF_ROLES.has(role)) throw new ShopError(400, "Choose a staff screen.");
    if (!isSetUp(role)) return fail(503, "Staff sign-in is not set up yet. Ask the owner to set the shift codes.");
    const caller = callerOf(request);
    const wrong = await guardCode(caller, role, pin);
    if (wrong) return wrong;
    const cleanName = typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 30) : "";
    if (role === "driver" && !driverId(cleanName).slice(4)) return fail(400, "Enter your name.");
    const who = { admin: { id: "kitchen", name: "Kitchen" }, staff: { id: "staff", name: "Staff" }, clock: { id: "clock", name: "Shop clock" }, driver: { id: driverId(cleanName), name: cleanName } }[role];
    const claims = { role, ...who };
    return ok(claims, { "set-cookie": await issueCookie(claims) });
  }

  /**
   * Checks a typed code with the lockouts; a failure Response, or null when
   * right. `roles` may name more than one code that will do.
   */
  async function guardCode(caller, roles, given, wrongMessage = "That code is not right.") {
    const wait = Math.max(loginLimiter.waitMs(caller, now()), globalLoginPausedUntil - now());
    if (wait > 0) return fail(429, `Too many wrong codes. Try again in ${Math.ceil(wait / 1000)} seconds.`);
    let isRight = false;
    for (const role of [roles].flat()) isRight = isRight || (await codeMatches(role, given));
    if (isRight) {
      loginLimiter.succeed(caller);
      return null;
    }
    loginLimiter.fail(caller, now());
    if (!globalLoginFails.hit("all", now())) globalLoginPausedUntil = now() + 15 * MINUTE;
    return fail(401, wrongMessage);
  }

  // The screens' codes each differ from the owner's code.
  const NAMES = { staff: "staff code", driver: "driver code" };
  async function clashingCode(role, next) {
    if (role === "admin") {
      for (const other of ["driver", "staff"]) {
        if (await codeMatches(other, next)) return `That is the ${NAMES[other]}. Pick a different owner's code.`;
      }
      return null;
    }
    if (NAMES[role] && (await codeMatches("admin", next))) return `That is the owner's code. Pick a different ${NAMES[role]}.`;
    return null;
  }

  // The owner changes a code, like a password: signed in on an admin screen,
  // with the current owner's code typed again.
  async function changeCode(request) {
    const { body } = await readBody(request, MAX_STAFF_BODY);
    const actor = await actorFor(request, body.as);
    if (actor.role !== "admin") throw new ShopError(403, "Only the owner can change the shift codes. Sign in again.");
    const role = ["admin", "staff", "driver", "list"].includes(body.role) ? body.role : null;
    if (!role) throw new ShopError(400, "Choose which code to change.");
    // The order list PIN changes with itself, or with the owner's code when
    // it has been forgotten.
    const wrong =
      role === "list"
        ? await guardCode(actor.ip, ["list", "admin"], body.current, "The current PIN is not right.")
        : await guardCode(actor.ip, "admin", body.current, "Your current owner's code is not right.");
    if (wrong) return wrong;
    const next = body.next;
    if (typeof next !== "string" || !CODE_SHAPE.test(next)) throw new ShopError(400, "Use 4 to 8 digits for the new code.");
    // A code that opens a staff screen must never also open the owner's.
    const clash = await clashingCode(role, next);
    if (clash) throw new ShopError(400, clash);
    const salt = newSalt();
    const record = { hash: await hashCode(next, salt), salt, changedAt: now() };
    const all = store.read(CODES, {});
    const write = () => store.write(CODES, { ...all, [role]: record });
    if (store.transaction) store.transaction(write);
    else write();
    versions.clear();
    // This device stays signed in; every other one using the old code is out.
    const fresh = { admin: () => issueCookie({ role: "admin", id: actor.id, name: actor.name }), list: listCookie }[role];
    const headers = fresh ? { "set-cookie": await fresh() } : {};
    return ok({ role, changedAt: record.changedAt }, headers);
  }

  // The order list's own PIN, typed on an admin screen that is signed in.
  async function unlockList(request) {
    const { body } = await readBody(request, MAX_STAFF_BODY);
    const actor = await actorFor(request, body.as);
    if (actor.role !== "admin") throw new ShopError(403, "Sign in to the admin first.");
    const wrong = await guardCode(actor.ip, "list", body.pin, "That PIN is not right.");
    if (wrong) return wrong;
    return ok(null, { "set-cookie": await listCookie() });
  }

  async function lockList(request) {
    await readBody(request, MAX_STAFF_BODY);
    return ok(null, { "set-cookie": cookieFor(LIST_COOKIE, "", 0) });
  }

  async function logout(request) {
    const { body } = await readBody(request, MAX_STAFF_BODY);
    if (!STAFF_ROLES.has(body.role)) throw new ShopError(400, "Choose a staff screen.");
    return ok(null, { "set-cookie": cookieFor(cookieName(body.role), "", 0) });
  }

  async function me(request, url) {
    const actor = await actorFor(request, url.searchParams.get("as"));
    return ok(actor.role === "public" ? null : { role: actor.role, id: actor.id, name: actor.name });
  }

  function photo(url) {
    const match = PHOTO_PATH.exec(url.pathname);
    const found = match ? store.readPhoto(match[1]) : null;
    if (!found) return fail(404, "That photo is not here.");
    return new Response(found.data, {
      headers: { "content-type": found.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
    });
  }

  // Moving the shop to another Cloudflare account: the owner downloads every
  // row here and loads it into the new, empty shop. Owner's sign-in only.
  async function exportAll(request, url) {
    const actor = await actorFor(request, url.searchParams.get("as"));
    if (actor.role !== "admin") throw new ShopError(403, "Only the owner can export the shop. Sign in again.");
    return ok(store.dump(), { "content-disposition": "attachment; filename=flexchicken-export.json" });
  }

  async function importAll(request) {
    const { body } = await readBody(request, MAX_IMPORT_BODY);
    const actor = await actorFor(request, body.as);
    if (actor.role !== "admin") throw new ShopError(403, "Only the owner can import into the shop. Sign in again.");
    let counts;
    try {
      counts = store.restore(body.dump);
    } catch (err) {
      throw new ShopError(400, err.message);
    }
    versions.clear(); // codes the owner changed came with the export
    broadcast(["orders", "settings", "menu_edits", "staff", "shifts", "loyalty_cards", "promotions", "stamp_tokens", "driver_locations", "expense_sheets"]);
    return ok(counts);
  }

  // The Epson printer asking for receipts, or reporting one it printed. It
  // cannot send the screens' CSRF header or cookie, so it proves itself with
  // the key in its URL (or as its ID, if pasted there instead).
  const xml = (body) =>
    new Response(body, { headers: { "content-type": "text/xml; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  async function printer(request, url) {
    const caller = callerOf(request);
    const form = new URLSearchParams(await readLimited(request, MAX_PRINTER_BODY));
    // The right key always gets in, so guesses from the shop's own address
    // (guest Wi-Fi) can never lock its printer out.
    if (!core.printer.keyMatches(url.searchParams.get("key")) && !core.printer.keyMatches(form.get("ID"))) {
      if (printerLimiter.waitMs(caller, now()) > 0) return fail(429, "Too many wrong printer keys.");
      printerLimiter.fail(caller, now());
      return fail(403, "That printer link is not right. Copy it again from Admin → Shop.");
    }
    const type = form.get("ConnectionType");
    if (type !== "GetRequest" && type !== "SetResponse") return fail(400, "Unknown printer request.");
    const { result, changed } = type === "GetRequest" ? core.printer.poll(url.origin) : core.printer.result(form.get("ResponseFile"));
    if (changed.length) broadcast(changed);
    return xml(type === "GetRequest" ? result ?? "" : "");
  }

  const ROUTES = {
    "POST /api/printer": printer,
    "GET /api/admin/export": exportAll,
    "POST /api/admin/import": importAll,
    "GET /api/shop/state": shopState,
    "POST /api/shop/call": shopCall,
    "POST /api/staff/login": login,
    "POST /api/staff/logout": logout,
    "POST /api/staff/code": changeCode,
    "POST /api/staff/list": unlockList,
    "POST /api/staff/list-lock": lockList,
    "GET /api/staff/me": me,
  };

  /** @param {Request} request */
  async function handle(request) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname.startsWith("/api/photo/")) return photo(url);
      const route = ROUTES[`${request.method} ${url.pathname}`];
      if (!route) return fail(404, "Not found.");
      return await route(request, url);
    } catch (err) {
      if (err instanceof ShopError) return fail(err.status, err.message);
      console.error("shop api", request.method, url.pathname, err);
      return fail(500, "Something went wrong. Please try again.");
    }
  }

  return { handle };
}
