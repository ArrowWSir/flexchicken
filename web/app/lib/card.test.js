import { describe, test, expect } from "vitest";
import {
  STAMPS_PER_CARD,
  CUSTOMER_ID_KEY,
  CUSTOMER_CACHE_KEY,
  clampStamps,
  generateCustomerId,
  isValidCustomerId,
  shortCodeFromId,
  readStoredCustomerId,
  storeCustomerId,
  loadCustomer,
  stampProgress,
  previewStampsFromSearch,
  setCustomerName,
  CARD_DELETED_KEY,
  adoptRestoredCard,
  clearCardDeleted,
  forgetCard,
  isCardDeleted,
  isFreshCounterScan,
  markCardDeleted,
  isValidRestoreToken,
  normalizeRestoreToken,
  justRedeemed,
  cacheCustomer,
} from "./card";

function memoryEnv({ storage = {}, cookies = {} } = {}) {
  const ls = { ...storage };
  const jar = { ...cookies };
  return {
    storage: {
      getItem: (k) => (k in ls ? ls[k] : null),
      setItem: (k, v) => {
        ls[k] = String(v);
      },
      removeItem: (k) => {
        delete ls[k];
      },
    },
    cookie: {
      get: (k) => (k in jar ? jar[k] : null),
      set: (k, v, days) => {
        if (days < 0) delete jar[k];
        else jar[k] = v;
      },
    },
    ls,
    jar,
  };
}

const throwing = () => {
  throw new Error("blocked");
};

describe("clampStamps", () => {
  test("keeps whole numbers between 0 and the card size", () => {
    expect(clampStamps(3)).toBe(3);
    expect(clampStamps(-2)).toBe(0);
    expect(clampStamps(99)).toBe(STAMPS_PER_CARD);
    expect(clampStamps(2.7)).toBe(2);
  });

  test("treats anything that is not a number as an empty card", () => {
    expect(clampStamps("4")).toBe(0);
    expect(clampStamps(NaN)).toBe(0);
    expect(clampStamps(undefined)).toBe(0);
  });
});

describe("customer ids", () => {
  test("mints a long secret, not four guessable characters", () => {
    expect(generateCustomerId(() => 0)).toBe(`fc_usr_${"a".repeat(18)}`);
    expect(generateCustomerId(Math.random)).toMatch(/^fc_usr_[a-z2-9]{18}$/);
  });

  test("two cards in a row do not collide", () => {
    expect(generateCustomerId()).not.toBe(generateCustomerId());
  });

  test("falls back to the tail of the id only when the database has no code", () => {
    expect(shortCodeFromId("fc_usr_k7qm")).toBe("K7QM");
  });

  test("rejects stringified accidents that would wedge the card", () => {
    for (const bad of [null, "", "undefined", "null", "fc_usr_", "fc_usr_undefined", "a b"]) {
      expect(isValidCustomerId(bad), String(bad)).toBe(false);
    }
    expect(isValidCustomerId("fc_usr_k7qm")).toBe(true);
  });
});

describe("readStoredCustomerId", () => {
  test("prefers localStorage", () => {
    const env = memoryEnv({ storage: { [CUSTOMER_ID_KEY]: "fc_usr_abcd" } });
    expect(readStoredCustomerId(env)).toBe("fc_usr_abcd");
  });

  test("restores from the cookie when iOS has cleared localStorage", () => {
    const env = memoryEnv({ cookies: { [CUSTOMER_ID_KEY]: "fc_usr_wxyz" } });
    expect(readStoredCustomerId(env)).toBe("fc_usr_wxyz");
    expect(env.ls[CUSTOMER_ID_KEY]).toBe("fc_usr_wxyz");
  });

  test("drops a poisoned value instead of failing on every load", () => {
    const env = memoryEnv({
      storage: { [CUSTOMER_ID_KEY]: "undefined" },
      cookies: { [CUSTOMER_ID_KEY]: "null" },
    });
    expect(readStoredCustomerId(env)).toBeNull();
    expect(env.ls[CUSTOMER_ID_KEY]).toBeUndefined();
    expect(env.jar[CUSTOMER_ID_KEY]).toBeUndefined();
  });
});

describe("storeCustomerId", () => {
  test("writes both localStorage and the long-lived cookie", () => {
    const env = memoryEnv();
    storeCustomerId(env, "fc_usr_abcd");
    expect(env.ls[CUSTOMER_ID_KEY]).toBe("fc_usr_abcd");
    expect(env.jar[CUSTOMER_ID_KEY]).toBe("fc_usr_abcd");
  });

  test("refuses to store an invalid id", () => {
    const env = memoryEnv();
    storeCustomerId(env, "undefined");
    expect(env.ls[CUSTOMER_ID_KEY]).toBeUndefined();
  });
});

describe("loadCustomer", () => {
  test("creates, stores and returns a fresh card on the first visit", () => {
    const env = memoryEnv();
    const id = `fc_usr_${"a".repeat(18)}`;
    const customer = loadCustomer(env, () => 0, 1000);
    expect(customer).toEqual({
      id,
      code: "",
      shortCode: "AAAA", // until the database mints one
      name: "",
      stamps: 0,
      createdAt: 1000,
    });
    expect(env.ls[CUSTOMER_ID_KEY]).toBe(id);
    expect(JSON.parse(env.ls[CUSTOMER_CACHE_KEY]).id).toBe(id);
  });

  test("returns the same card and stamps on the next visit", () => {
    const env = memoryEnv({
      storage: {
        [CUSTOMER_ID_KEY]: "fc_usr_abcd",
        [CUSTOMER_CACHE_KEY]: JSON.stringify({ id: "fc_usr_abcd", stamps: 5, createdAt: 7 }),
      },
    });
    expect(loadCustomer(env)).toMatchObject({ id: "fc_usr_abcd", shortCode: "ABCD", stamps: 5 });
  });

  test("ignores a cached record that belongs to another card and clamps tampering", () => {
    const other = memoryEnv({
      storage: {
        [CUSTOMER_ID_KEY]: "fc_usr_abcd",
        [CUSTOMER_CACHE_KEY]: JSON.stringify({ id: "fc_usr_zzzz", stamps: 6 }),
      },
    });
    expect(loadCustomer(other).stamps).toBe(0);

    const tampered = memoryEnv({
      storage: {
        [CUSTOMER_ID_KEY]: "fc_usr_abcd",
        [CUSTOMER_CACHE_KEY]: JSON.stringify({ id: "fc_usr_abcd", stamps: 40 }),
      },
    });
    expect(loadCustomer(tampered).stamps).toBe(STAMPS_PER_CARD);
  });

  test("still hands back a card when storage and cookies throw", () => {
    const env = {
      storage: { getItem: throwing, setItem: throwing, removeItem: throwing },
      cookie: { get: throwing, set: throwing },
    };
    expect(loadCustomer(env).id).toMatch(/^fc_usr_/);
  });
});

describe("setCustomerName", () => {
  test("keeps a trimmed name on the card and in storage", () => {
    const env = memoryEnv({ storage: { [CUSTOMER_ID_KEY]: "fc_usr_abcd" } });
    expect(setCustomerName(env, "  Luca  ")).toMatchObject({ id: "fc_usr_abcd", name: "Luca" });
    expect(JSON.parse(env.ls[CUSTOMER_CACHE_KEY]).name).toBe("Luca");
  });
});

describe("cacheCustomer", () => {
  test("stores what the database sent, so the card still works offline", () => {
    const env = memoryEnv({ storage: { [CUSTOMER_ID_KEY]: "fc_usr_abcd" } });
    const saved = cacheCustomer(env, {
      id: "fc_usr_abcd",
      code: "M4RS",
      name: " Luca ",
      stamps: 12,
      createdAt: 5,
    });
    expect(saved).toEqual({
      id: "fc_usr_abcd",
      code: "M4RS",
      shortCode: "M4RS", // the database's code wins over the id's tail
      name: "Luca",
      stamps: 8,
      createdAt: 5,
    });
    expect(JSON.parse(env.ls[CUSTOMER_CACHE_KEY])).toMatchObject({ name: "Luca", stamps: 8 });
  });

  test("ignores a record with no card id", () => {
    expect(cacheCustomer(memoryEnv(), {})).toEqual({});
  });
});

describe("restore tokens", () => {
  test("accepts the six characters staff read out, however they are typed", () => {
    expect(normalizeRestoreToken(" k7qm-2b ")).toBe("K7QM2B");
    expect(isValidRestoreToken("k7qm2b")).toBe(true);
  });

  test("rejects anything that is not six characters", () => {
    for (const bad of ["", "K7QM2", "K7QM2BX", "K7 QM2"]) {
      expect(isValidRestoreToken(bad), bad).toBe(false);
    }
  });
});

describe("adoptRestoredCard", () => {
  test("points this device at the card the database handed back", () => {
    const env = memoryEnv({ storage: { [CUSTOMER_ID_KEY]: "fc_usr_abcd" } });
    const restored = adoptRestoredCard(env, {
      id: "fc_usr_longsecretvalue1",
      code: "K7QM",
      name: "Luca",
      stamps: 6,
      createdAt: 9,
    });
    expect(restored).toMatchObject({
      id: "fc_usr_longsecretvalue1",
      shortCode: "K7QM",
      name: "Luca",
      stamps: 6,
    });
    expect(env.ls[CUSTOMER_ID_KEY]).toBe("fc_usr_longsecretvalue1");
    expect(env.jar[CUSTOMER_ID_KEY]).toBe("fc_usr_longsecretvalue1");
  });

  test("leaves this device alone when the database sent nothing usable", () => {
    for (const bad of [null, {}, { id: "" }, { id: "undefined" }]) {
      const env = memoryEnv({ storage: { [CUSTOMER_ID_KEY]: "fc_usr_abcd" } });
      expect(adoptRestoredCard(env, bad), JSON.stringify(bad)).toBeNull();
      expect(env.ls[CUSTOMER_ID_KEY]).toBe("fc_usr_abcd");
    }
  });
});

describe("a card staff threw away", () => {
  test("marking it deleted takes the card off the device", () => {
    const env = memoryEnv({
      storage: {
        [CUSTOMER_ID_KEY]: "fc_usr_abcd",
        [CUSTOMER_CACHE_KEY]: JSON.stringify({ id: "fc_usr_abcd", stamps: 7 }),
      },
    });
    markCardDeleted(env);
    expect(isCardDeleted(env)).toBe(true);
    expect(env.ls[CUSTOMER_ID_KEY]).toBeUndefined();
    expect(env.ls[CUSTOMER_CACHE_KEY]).toBeUndefined();
  });

  test("survives iOS clearing localStorage, because the cookie remembers", () => {
    const env = memoryEnv();
    markCardDeleted(env);
    delete env.ls[CARD_DELETED_KEY];
    expect(isCardDeleted(env)).toBe(true);
  });

  test("a device that was never deleted is not treated as one", () => {
    expect(isCardDeleted(memoryEnv())).toBe(false);
  });

  test("clearing it lets the next load mint a card again", () => {
    const env = memoryEnv();
    markCardDeleted(env);
    clearCardDeleted(env);
    expect(isCardDeleted(env)).toBe(false);
    expect(loadCustomer(env).id).toMatch(/^fc_usr_[a-z2-9]{18}$/);
  });

  test("forgetting the card mints a different one next time, id cookie and all", () => {
    const env = memoryEnv();
    const first = loadCustomer(env);
    forgetCard(env);
    expect(env.jar[CUSTOMER_ID_KEY]).toBeFalsy();
    expect(loadCustomer(env).id).not.toBe(first.id);
  });

  test("only the counter's QR counts as a fresh scan", () => {
    expect(isFreshCounterScan("?new=1")).toBe(true);
    expect(isFreshCounterScan("?new")).toBe(true);
    expect(isFreshCounterScan("")).toBe(false);
    expect(isFreshCounterScan("?stamps=8")).toBe(false);
  });
});

describe("justRedeemed", () => {
  test("true only when a full card drops back down", () => {
    expect(justRedeemed(STAMPS_PER_CARD, 0)).toBe(true);
    expect(justRedeemed(STAMPS_PER_CARD, 7)).toBe(true);
  });

  test("false for ordinary stamping, a first load, or a card that stays full", () => {
    expect(justRedeemed(3, 4)).toBe(false);
    expect(justRedeemed(null, 0)).toBe(false);
    expect(justRedeemed(7, STAMPS_PER_CARD)).toBe(false);
    expect(justRedeemed(STAMPS_PER_CARD, STAMPS_PER_CARD)).toBe(false);
  });
});

describe("stampProgress", () => {
  test("counts what is left to the surprise reward", () => {
    expect(stampProgress(3)).toEqual({ filled: 3, remaining: 5, isComplete: false });
  });

  test("marks a full card as complete", () => {
    expect(stampProgress(8)).toEqual({ filled: 8, remaining: 0, isComplete: true });
  });
});

describe("previewStampsFromSearch", () => {
  test("reads ?stamps=N for design previews", () => {
    expect(previewStampsFromSearch("?stamps=5")).toBe(5);
    expect(previewStampsFromSearch("?stamps=12")).toBe(8);
  });

  test("ignores missing or non-numeric values", () => {
    expect(previewStampsFromSearch("")).toBeNull();
    expect(previewStampsFromSearch("?stamps=lots")).toBeNull();
  });
});
