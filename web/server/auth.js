// Staff sign-in for the server. The shift codes live in Worker secrets, never
// in the browser bundle. A right code gets an HttpOnly cookie signed with
// HMAC-SHA256: scripts on the page cannot read it, and it cannot be edited
// into a different role without the secret.

const encoder = new TextEncoder();

const toBase64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text) => {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const keyFor = (secret) => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

/** "claims.mac", with `exp` set `maxAgeS` seconds from `now`. */
export async function signClaims(secret, claims, now, maxAgeS) {
  const body = toBase64Url(encoder.encode(JSON.stringify({ ...claims, exp: now + maxAgeS * 1000 })));
  const mac = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(body));
  return `${body}.${toBase64Url(mac)}`;
}

/** The claims if the value is ours and still in date, else null. */
export async function verifyClaims(secret, value, now) {
  if (typeof value !== "string") return null;
  const [body, mac, extra] = value.split(".");
  if (!body || !mac || extra !== undefined) return null;
  try {
    const isOurs = await crypto.subtle.verify("HMAC", await keyFor(secret), fromBase64Url(mac), encoder.encode(body));
    if (!isOurs) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    return Number.isFinite(claims?.exp) && claims.exp > now ? claims : null;
  } catch {
    return null;
  }
}

export const cookieFor = (name, value, maxAgeS) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeS}`;

export function readCookie(header, name) {
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

/** Same time whatever the input, so the code cannot be found a digit at a time. */
export function pinMatches(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string" || !expected) return false;
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i += 1) diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Wrong-code lockout per caller (IP address), kept in the Durable Object's
 * memory: a restart forgets it, which only ever lets someone try again sooner.
 */
export function createLimiter({ maxFails = 5, lockMs = 30_000, maxKeys = 5000 } = {}) {
  const fails = new Map(); // key -> { count, lockedUntil }
  return {
    waitMs(key, now) {
      const entry = fails.get(key);
      if (!entry || entry.lockedUntil <= now) return 0;
      return entry.lockedUntil - now;
    },
    fail(key, now) {
      const entry = fails.get(key);
      const isFresh = !entry || (entry.lockedUntil && entry.lockedUntil <= now);
      const count = (isFresh ? 0 : entry.count) + 1;
      if (fails.size >= maxKeys && !fails.has(key)) fails.delete(fails.keys().next().value);
      fails.set(key, { count: count >= maxFails ? 0 : count, lockedUntil: count >= maxFails ? now + lockMs : 0 });
    },
    succeed(key) {
      fails.delete(key);
    },
  };
}

/**
 * A short fingerprint of the current shift code. Cookies carry it, so
 * changing a code (a member of staff leaves) signs out every device that
 * used the old one.
 */
export async function codeVersion(secret, code) {
  const mac = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(`code:${code}`));
  return toBase64Url(mac).slice(0, 16);
}

/** At most `max` hits per `windowMs` for each key (fixed windows). */
export function createRateLimit({ max, windowMs, maxKeys = 5000 }) {
  const windows = new Map(); // key -> { start, count }
  return {
    /** True if this hit is allowed (and counts it). */
    hit(key, now) {
      const entry = windows.get(key);
      if (!entry || now - entry.start >= windowMs) {
        if (windows.size >= maxKeys && !windows.has(key)) windows.delete(windows.keys().next().value);
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
  };
}

/** The caller's address for limits: IPv6 by its /64, which one home or phone holds. */
export function callerKey(ip) {
  if (typeof ip !== "string" || !ip) return "unknown";
  if (!ip.includes(":")) return ip;
  return ip.split(":").slice(0, 4).join(":");
}

// Shift codes the owner sets from /admin are kept only as PBKDF2 hashes.
// 100,000 rounds is the most Workers allow; with the lockouts above it makes
// a stolen hash slow to guess, though a short code is never strong.
const CODE_ROUNDS = 100_000;

export const newSalt = () => toBase64Url(crypto.getRandomValues(new Uint8Array(16)));

/** The stored form of a shift code: base64url PBKDF2-SHA256. */
export async function hashCode(code, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(String(code)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: CODE_ROUNDS }, key, 256);
  return toBase64Url(bits);
}
