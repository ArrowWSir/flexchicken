import { describe, expect, test } from "vitest";
import { emailUrl, feedbackMessage, googleReviewUrl, isGoodRating, whatsappUrl } from "./review";

describe("isGoodRating", () => {
  test("4 and 5 stars go to Google; 1 to 3 do not", () => {
    expect([1, 2, 3, 4, 5].map(isGoodRating)).toEqual([false, false, false, true, true]);
  });

  test("anything that is not a whole star count is not good", () => {
    expect(isGoodRating(4.5)).toBe(false);
    expect(isGoodRating(6)).toBe(false);
    expect(isGoodRating(undefined)).toBe(false);
  });
});

describe("googleReviewUrl", () => {
  test("uses the owner's review link when set, otherwise the Maps listing", () => {
    expect(googleReviewUrl({ googleReviewUrl: "https://g.page/r/x/review", googleFallbackUrl: "https://maps" })).toBe("https://g.page/r/x/review");
    expect(googleReviewUrl({ googleReviewUrl: null, googleFallbackUrl: "https://maps" })).toBe("https://maps");
  });
});

describe("private feedback", () => {
  test("the message carries the stars, the order and what the customer wrote", () => {
    expect(feedbackMessage({ stars: 2, orderNumber: "#0042", note: " Chips were cold " })).toBe(
      "Flex Chicken feedback: 2 of 5 stars, order #0042.\n\nChips were cold"
    );
    expect(feedbackMessage({ stars: 1 })).toMatch(/What went wrong: $/);
  });

  test("WhatsApp needs a real number and encodes the text", () => {
    expect(whatsappUrl("hi there", null)).toBeNull();
    expect(whatsappUrl("hi", "123")).toBeNull();
    expect(whatsappUrl("a&b", "+44 7700 900123")).toBe("https://wa.me/447700900123?text=a%26b");
  });

  test("email goes to the shop with a subject naming the rating", () => {
    const url = emailUrl("body text", { stars: 1, orderNumber: "#0007" }, "info@flexchicken.co.uk");
    expect(url).toBe("mailto:info@flexchicken.co.uk?subject=Feedback%3A%201%20star%2C%20order%20%230007&body=body%20text");
  });
});
