import { describe, expect, test } from "vitest";
import { TOKEN_LENGTH, TOKEN_TTL_MS, isTokenShaped, issueToken, mintToken, readTokens, redeemToken, tokenProblem } from "./stampTokens";

const NOW = Date.UTC(2026, 9, 6, 18, 0);
let seed = 0;
// Different bytes each call, so each mint is a new token.
const bytes = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed++) % 256);

describe("mintToken", () => {
  test("is long and uses the unambiguous alphabet", () => {
    const token = mintToken();
    expect(token).toHaveLength(TOKEN_LENGTH);
    expect(isTokenShaped(token)).toBe(true);
    expect(token).not.toMatch(/[01IO]/);
  });

  test("two mints differ", () => {
    expect(mintToken()).not.toBe(mintToken());
  });
});

describe("issueToken", () => {
  test("mints one token per order, and a reprint gets the same one", () => {
    const first = issueToken([], "ord_1", NOW, bytes);
    const again = issueToken(first.tokens, "ord_1", NOW + 5000, bytes);
    expect(again.token).toBe(first.token);
    expect(again.tokens).toHaveLength(1);
  });

  test("different orders get different tokens", () => {
    const a = issueToken([], "ord_1", NOW, bytes);
    const b = issueToken(a.tokens, "ord_2", NOW, bytes);
    expect(b.token).not.toBe(a.token);
    expect(b.tokens).toHaveLength(2);
  });

  test("needs an order", () => {
    expect(() => issueToken([], "", NOW)).toThrow(/order/);
  });
});

describe("redeemToken", () => {
  const issued = issueToken([], "ord_1", NOW, bytes);

  test("works once, recording which card used it", () => {
    const { tokens, record } = redeemToken(issued.tokens, issued.token, "fc_usr_card", NOW + 60_000);
    expect(record).toMatchObject({ orderId: "ord_1", usedAt: NOW + 60_000, cardId: "fc_usr_card" });
    expect(() => redeemToken(tokens, issued.token, "fc_usr_other", NOW + 120_000)).toThrow(/already been collected/);
  });

  test("does not change the list it was given", () => {
    redeemToken(issued.tokens, issued.token, "fc_usr_card", NOW);
    expect(issued.tokens[0].usedAt).toBeNull();
  });

  test("accepts the token in lower case or with spaces", () => {
    const messy = ` ${issued.token.toLowerCase()} `;
    expect(redeemToken(issued.tokens, messy, "fc_usr_card", NOW).record.usedAt).toBe(NOW);
  });

  test("refuses an unknown token, an expired one, and a missing card", () => {
    expect(() => redeemToken(issued.tokens, "ABCDEFGHJKLMNPQRSTUV", "fc_usr_card", NOW)).toThrow(/recognise/);
    expect(() => redeemToken(issued.tokens, issued.token, "fc_usr_card", NOW + TOKEN_TTL_MS + 1)).toThrow(/expired/);
    expect(() => redeemToken(issued.tokens, issued.token, "", NOW)).toThrow(/card/);
  });

  test("tokenProblem is null for a live token", () => {
    expect(tokenProblem(issued.tokens, issued.token, NOW)).toBeNull();
  });
});

describe("readTokens", () => {
  test("drops malformed records", () => {
    const good = issueToken([], "ord_1", NOW, bytes).tokens[0];
    expect(readTokens([good, null, { token: "short", orderId: "x", createdAt: 1 }, { ...good, orderId: 5 }])).toEqual([good]);
    expect(readTokens("nope")).toEqual([]);
  });
});
