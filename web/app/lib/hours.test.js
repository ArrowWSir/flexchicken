import { describe, expect, test } from "vitest";
import { DAYS, hoursDisplay, openStatus, readSchedule } from "./hours";

const DAILY = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, ["12:00", "23:00"]])
);

// London is on BST (UTC+1) in July and GMT (UTC+0) in January.
describe("openStatus", () => {
  test("open in the middle of the day, London time", () => {
    expect(openStatus(new Date("2026-07-15T13:00:00Z"), DAILY)).toEqual({ isOpen: true, label: "Open now · until 11pm" });
  });

  test("closed before opening, says when it opens", () => {
    expect(openStatus(new Date("2026-07-15T09:00:00Z"), DAILY)).toEqual({ isOpen: false, label: "Closed · opens 12pm" });
  });

  test("uses BST, not UTC: 22:30 UTC in July is 23:30 in London, so closed", () => {
    expect(openStatus(new Date("2026-07-15T22:30:00Z"), DAILY).isOpen).toBe(false);
  });

  test("uses GMT in winter: 22:30 UTC in January is 22:30 in London, so open", () => {
    expect(openStatus(new Date("2026-01-15T22:30:00Z"), DAILY).isOpen).toBe(true);
  });

  test("closing time itself counts as closed", () => {
    expect(openStatus(new Date("2026-01-15T23:00:00Z"), DAILY).isOpen).toBe(false);
  });

  test("a day with no hours is closed all day", () => {
    const schedule = { ...DAILY, wednesday: null };
    expect(openStatus(new Date("2026-07-15T13:00:00Z"), schedule)).toEqual({ isOpen: false, label: "Closed today" });
  });
});

describe("openStatus, late nights and closed days", () => {
  // 2026-07-17 is a Friday; London is UTC+1.
  const LATE_FRIDAY = { ...DAILY, friday: ["12:00", "01:00"] };

  test("a day that closes after midnight is open late", () => {
    expect(openStatus(new Date("2026-07-17T22:30:00Z"), LATE_FRIDAY)).toEqual({ isOpen: true, label: "Open now · until 1am" });
  });

  test("after midnight the night before still counts", () => {
    // 00:30 Saturday in London.
    expect(openStatus(new Date("2026-07-17T23:30:00Z"), LATE_FRIDAY)).toEqual({ isOpen: true, label: "Open now · until 1am" });
  });

  test("past the late close it is shut", () => {
    expect(openStatus(new Date("2026-07-18T00:30:00Z"), LATE_FRIDAY).isOpen).toBe(false);
  });

  test("after closing, names the next day that opens when tomorrow is closed", () => {
    // Wednesday 23:30, Thursday closed.
    const schedule = { ...DAILY, thursday: null };
    expect(openStatus(new Date("2026-07-15T22:30:00Z"), schedule).label).toBe("Closed · opens Friday 12pm");
  });

  test("after closing, says tomorrow when tomorrow opens", () => {
    expect(openStatus(new Date("2026-07-15T22:30:00Z"), DAILY).label).toBe("Closed · opens tomorrow 12pm");
  });

  test("never open: says so", () => {
    const shut = Object.fromEntries(DAYS.map((d) => [d, null]));
    expect(openStatus(new Date("2026-07-15T13:00:00Z"), shut)).toEqual({ isOpen: false, label: "Closed" });
  });
});

describe("readSchedule", () => {
  test("keeps a valid week, with closed days as null", () => {
    const week = { ...DAILY, monday: null };
    expect(readSchedule(week)).toEqual(week);
  });

  test("rejects bad times, missing days and equal open/close", () => {
    expect(readSchedule({ ...DAILY, monday: ["25:00", "23:00"] })).toBeNull();
    expect(readSchedule({ ...DAILY, monday: ["12:00", "12:00"] })).toBeNull();
    const { sunday, ...sixDays } = DAILY;
    expect(readSchedule(sixDays)).toBeNull();
    expect(readSchedule("always")).toBeNull();
  });
});

describe("hoursDisplay", () => {
  test("one line when every day is the same", () => {
    expect(hoursDisplay(DAILY)).toBe("Daily, 12pm – 11pm");
  });

  test("groups runs of days with the same hours", () => {
    const week = { ...DAILY, friday: ["12:00", "01:00"], saturday: ["12:00", "01:00"], sunday: null };
    expect(hoursDisplay(week)).toBe("Mon–Thu 12pm – 11pm · Fri–Sat 12pm – 1am · Sun closed");
  });
});
