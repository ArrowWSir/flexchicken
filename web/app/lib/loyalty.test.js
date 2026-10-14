import { describe, expect, test } from "vitest";
import { addStamp, findCards, isMemberCode, mintCode, readCards, redeemReward, registerCard, removeCard, removeStamp, renameCard } from "./loyalty";

const T0 = 1_760_000_000_000;
const fixed = (n) => () => n; // random() that always returns n

function cardWith(stamps, extra = {}) {
  const { cards } = registerCard([], { id: "fc_usr_a", name: "Amira" }, T0, fixed(0.5));
  return cards.map((c) => ({ ...c, stamps, ...extra }));
}

describe("member codes", () => {
  test("are four digits with no leading zero", () => {
    expect(mintCode([], fixed(0))).toBe("1000");
    expect(mintCode([], fixed(0.9999999))).toBe("9999");
    expect(isMemberCode("4271")).toBe(true);
    expect(isMemberCode("427")).toBe(false);
    expect(isMemberCode("42a1")).toBe(false);
  });

  test("never repeat; when random keeps colliding, the next free one is used", () => {
    expect(mintCode(["1000"], fixed(0))).toBe("1001");
  });

  test("say so when every code is taken", () => {
    const all = Array.from({ length: 9000 }, (_, i) => String(1000 + i));
    expect(() => mintCode(all, fixed(0))).toThrow(/every 4-digit/i);
  });
});

describe("registerCard", () => {
  test("adds a new card with a code and an empty history", () => {
    const { cards, card } = registerCard([], { id: "fc_usr_a", name: " Amira  K " }, T0, fixed(0.5));
    expect(cards).toHaveLength(1);
    expect(card).toMatchObject({ id: "fc_usr_a", code: "5500", name: "Amira K", stamps: 0, lifetimeStamps: 0, rewards: 0, lastStampAt: null, createdAt: T0 });
  });

  test("is idempotent, and fills in a missing name or email without overwriting", () => {
    const first = registerCard([], { id: "fc_usr_a" }, T0, fixed(0.5));
    const second = registerCard(first.cards, { id: "fc_usr_a", name: "Amira", email: "A@B.COM" }, T0 + 5);
    expect(second.cards).toHaveLength(1);
    expect(second.card).toMatchObject({ code: "5500", name: "Amira", email: "a@b.com", createdAt: T0 });
    const third = registerCard(second.cards, { id: "fc_usr_a", name: "Someone else" }, T0 + 9);
    expect(third.card.name).toBe("Amira");
    expect(third.cards).toBe(second.cards); // nothing changed, nothing rewritten
  });
});

describe("stamps", () => {
  test("a stamp adds to the card, the lifetime count and the log", () => {
    const [card] = addStamp(cardWith(0), "fc_usr_a", T0 + 1, "counter");
    expect(card).toMatchObject({ stamps: 1, lifetimeStamps: 1, lastStampAt: T0 + 1 });
    expect(card.history).toEqual([{ type: "stamp", at: T0 + 1, by: "counter" }]);
  });

  test("a full card is not over-filled", () => {
    expect(() => addStamp(cardWith(8), "fc_usr_a", T0)).toThrow(/full/);
  });

  test("undo floors at zero and does not move the last visit", () => {
    const [card] = removeStamp(cardWith(3, { lifetimeStamps: 3, lastStampAt: T0 }), "fc_usr_a", T0 + 99);
    expect(card).toMatchObject({ stamps: 2, lifetimeStamps: 2, lastStampAt: T0 });
    expect(() => removeStamp(cardWith(0), "fc_usr_a", T0)).toThrow(/no stamps/);
  });

  test("the surprise needs a full card and starts it again", () => {
    expect(() => redeemReward(cardWith(7), "fc_usr_a", T0)).toThrow(/after 8 stamps/);
    const [card] = redeemReward(cardWith(8, { lifetimeStamps: 8 }), "fc_usr_a", T0 + 2);
    expect(card).toMatchObject({ stamps: 0, rewards: 1, lifetimeStamps: 8, lastRewardAt: T0 + 2 });
  });

  test("an unknown card is an error, not a silent no-op", () => {
    expect(() => addStamp([], "nobody", T0)).toThrow(/not on the register/);
  });

  test("changes never touch the list they were given", () => {
    const before = cardWith(2);
    const frozen = JSON.stringify(before);
    addStamp(before, "fc_usr_a", T0);
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe("findCards", () => {
  const cards = [
    { id: "1", code: "4271", name: "Amira", email: "amira@x.com", createdAt: 1, lastStampAt: 50 },
    { id: "2", code: "4290", name: "Ben", email: "ben@x.com", createdAt: 2, lastStampAt: 90 },
    { id: "3", code: "8812", name: "Chloe", email: "", createdAt: 3, lastStampAt: null },
  ];

  test("digits search codes from the start", () => {
    expect(findCards(cards, "42").map((c) => c.code)).toEqual(["4290", "4271"]);
    expect(findCards(cards, "8812").map((c) => c.id)).toEqual(["3"]);
    expect(findCards(cards, "271")).toEqual([]);
  });

  test("words search names and emails, most recent first", () => {
    expect(findCards(cards, "ben").map((c) => c.id)).toEqual(["2"]);
    expect(findCards(cards, "x.com").map((c) => c.id)).toEqual(["2", "1"]);
    expect(findCards(cards, "").map((c) => c.id)).toEqual(["2", "1", "3"]);
  });
});

test("renameCard tidies the name", () => {
  expect(renameCard(cardWith(0), "fc_usr_a", "  Big   Al ")[0].name).toBe("Big Al");
});

test("readCards drops junk and repairs counters", () => {
  const cards = readCards([{ id: "a", code: "1234", stamps: 99, rewards: -1 }, { id: "b", code: "12" }, null, "x"]);
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ code: "1234", stamps: 8, rewards: 0, history: [] });
  expect(readCards("nope")).toEqual([]);
});

describe("removeCard", () => {
  const cards = [
    { id: "a", code: "1111", name: "Ann" },
    { id: "b", code: "2222", name: "Ben" },
  ];

  test("takes the card off the register and leaves the rest", () => {
    expect(removeCard(cards, "a")).toEqual([{ id: "b", code: "2222", name: "Ben" }]);
  });

  test("does not change the list it is given", () => {
    const frozen = Object.freeze(cards.map((c) => Object.freeze({ ...c })));
    removeCard(frozen, "a");
    expect(frozen).toHaveLength(2);
  });

  test("says so when the card is already gone", () => {
    expect(() => removeCard(cards, "zzz")).toThrow("That card is not on the register.");
  });
});
