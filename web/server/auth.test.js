import { describe, expect, test } from "vitest";
import { cookieFor, createLimiter, pinMatches, readCookie, signClaims, verifyClaims } from "./auth";

const SECRET = "test-secret-that-is-long-enough-for-hmac";

describe("signed staff cookies", () => {
  test("round-trips the claims", async () => {
    const value = await signClaims(SECRET, { role: "admin", id: "kitchen", name: "Kitchen" }, 1000, 60);
    expect(await verifyClaims(SECRET, value, 2000)).toEqual({ role: "admin", id: "kitchen", name: "Kitchen", exp: 61_000 });
  });

  test("refuses a changed, expired or foreign cookie", async () => {
    const value = await signClaims(SECRET, { role: "driver", id: "drv_sam", name: "Sam" }, 0, 60);
    const [body, mac] = value.split(".");
    const forged = btoa(JSON.stringify({ role: "admin", id: "x", name: "x", exp: 9e12 })).replace(/=+$/, "");
    expect(await verifyClaims(SECRET, `${forged}.${mac}`, 1)).toBeNull();
    expect(await verifyClaims(SECRET, `${body}.${mac}x`, 1)).toBeNull();
    expect(await verifyClaims(SECRET, value, 61_000)).toBeNull();
    expect(await verifyClaims("another-secret-entirely-different", value, 1)).toBeNull();
    expect(await verifyClaims(SECRET, "junk", 1)).toBeNull();
    expect(await verifyClaims(SECRET, null, 1)).toBeNull();
  });

  test("writes a cookie scripts cannot read", () => {
    const header = cookieFor("fc_admin", "abc", 3600);
    expect(header).toContain("fc_admin=abc");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Max-Age=3600");
  });

  test("reads one cookie from the header", () => {
    expect(readCookie("a=1; fc_admin=xyz.abc; b=2", "fc_admin")).toBe("xyz.abc");
    expect(readCookie("a=1", "fc_admin")).toBeNull();
    expect(readCookie(null, "fc_admin")).toBeNull();
  });
});

describe("pinMatches", () => {
  test("matches only the exact code", () => {
    expect(pinMatches("482193", "482193")).toBe(true);
    expect(pinMatches("482194", "482193")).toBe(false);
    expect(pinMatches("48219", "482193")).toBe(false);
    expect(pinMatches("", "")).toBe(false);
    expect(pinMatches(482193, "482193")).toBe(false);
  });
});

describe("createLimiter", () => {
  test("locks a caller after too many wrong tries, then lets them back", () => {
    const limiter = createLimiter({ maxFails: 3, lockMs: 30_000 });
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.waitMs("ip1", 0)).toBe(0);
      limiter.fail("ip1", 0);
    }
    expect(limiter.waitMs("ip1", 1000)).toBe(29_000);
    expect(limiter.waitMs("ip2", 1000)).toBe(0);
    expect(limiter.waitMs("ip1", 31_000)).toBe(0);
  });

  test("a right PIN clears the count", () => {
    const limiter = createLimiter({ maxFails: 2, lockMs: 30_000 });
    limiter.fail("ip1", 0);
    limiter.succeed("ip1");
    limiter.fail("ip1", 0);
    expect(limiter.waitMs("ip1", 0)).toBe(0);
  });
});

describe("createRateLimit", () => {
  test("allows up to the limit in a window, then waits for the next", async () => {
    const { createRateLimit } = await import("./auth");
    const limit = createRateLimit({ max: 2, windowMs: 1000 });
    expect([limit.hit("a", 0), limit.hit("a", 1), limit.hit("a", 2), limit.hit("b", 2)]).toEqual([true, true, false, true]);
    expect(limit.hit("a", 1000)).toBe(true);
  });
});

describe("callerKey", () => {
  test("groups an IPv6 /64 and keeps IPv4 as is", async () => {
    const { callerKey } = await import("./auth");
    expect(callerKey("2a00:23c6:1:2:aaaa:bbbb:cccc:dddd")).toBe(callerKey("2a00:23c6:1:2:1111:2222:3333:4444"));
    expect(callerKey("81.2.69.160")).toBe("81.2.69.160");
    expect(callerKey(null)).toBe("unknown");
  });
});

describe("codeVersion", () => {
  test("changes with the code", async () => {
    const { codeVersion } = await import("./auth");
    expect(await codeVersion(SECRET, "11112222")).toBe(await codeVersion(SECRET, "11112222"));
    expect(await codeVersion(SECRET, "11112222")).not.toBe(await codeVersion(SECRET, "11112223"));
  });
});
