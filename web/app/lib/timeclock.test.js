import { describe, expect, test } from "vitest";
import {
  addStaff,
  clockIn,
  clockOut,
  correctShift,
  findByIdAndPin,
  formatDuration,
  isLongShift,
  isValidPin,
  isValidStaffId,
  nextStaffId,
  openShift,
  pinHash,
  removeStaff,
  shiftMinutes,
  timesheet,
  timesheetCsv,
  updateStaff,
  weekEnd,
  weekStart,
  withStaffIds,
} from "./timeclock";

const T0 = new Date(2026, 9, 5, 9, 0).getTime(); // Mon 5 Oct 2026, 09:00 device time
const MIN = 60_000;

function team() {
  let staff = addStaff([], { name: "  Ali   Khan ", role: "kitchen", pin: "1234" }, T0);
  staff = addStaff(staff, { name: "Sam", role: "driver", pin: "5678" }, T0 + 1);
  return staff;
}

describe("staff", () => {
  test("adds a member with a tidy name and a hashed PIN", () => {
    const [ali] = team();
    expect(ali).toMatchObject({ name: "Ali Khan", role: "kitchen", isActive: true });
    expect(ali.pinHash).toBe(pinHash("1234"));
    expect(JSON.stringify(ali)).not.toContain("1234");
  });

  test("gives every member a different id", () => {
    const [a, b] = team();
    expect(a.id).not.toBe(b.id);
  });

  test("rejects a missing name, an unknown role and a bad PIN", () => {
    expect(() => addStaff([], { name: " ", role: "kitchen", pin: "1234" }, T0)).toThrow(/name/);
    expect(() => addStaff([], { name: "A", role: "chef", pin: "1234" }, T0)).toThrow(/role/);
    expect(() => addStaff([], { name: "A", role: "kitchen", pin: "12a4" }, T0)).toThrow(/4 digits/);
    expect(() => addStaff([], { name: "A", role: "kitchen", pin: "12345" }, T0)).toThrow(/4 digits/);
  });

  test("gives each member their own Staff ID, from 101 up", () => {
    const [ali, sam] = team();
    expect([ali.code, sam.code]).toEqual(["101", "102"]);
  });

  test("the owner may choose the Staff ID, but not one already given", () => {
    const staff = addStaff(team(), { name: "Jo", role: "counter", pin: "1111", code: "250" }, T0);
    expect(staff.at(-1).code).toBe("250");
    expect(nextStaffId(staff)).toBe("251");
    expect(() => addStaff(staff, { name: "Mo", role: "counter", pin: "1111", code: "101" }, T0)).toThrow(/belongs to Ali Khan/);
    expect(() => addStaff(staff, { name: "Mo", role: "counter", pin: "1111", code: "42" }, T0)).toThrow(/3 digits/);
    expect(() => addStaff(staff, { name: "Mo", role: "counter", pin: "1111", code: "042" }, T0)).toThrow(/3 digits/);
  });

  test("two people may share a PIN; the Staff ID tells them apart", () => {
    const staff = addStaff(team(), { name: "Jo", role: "counter", pin: "1234" }, T0);
    expect(findByIdAndPin(staff, "101", "1234").name).toBe("Ali Khan");
    expect(findByIdAndPin(staff, "103", "1234").name).toBe("Jo");
  });

  test("a removed member's Staff ID is never given again, and no longer clocks in", () => {
    const [ali, sam] = team();
    const staff = removeStaff([ali, sam], ali.id);
    expect(staff.find((s) => s.id === ali.id).isActive).toBe(false);
    expect(findByIdAndPin(staff, "101", "1234")).toBeNull();
    expect(addStaff(staff, { name: "Jo", role: "counter", pin: "1234" }, T0).at(-1).code).toBe("103");
    expect(() => addStaff(staff, { name: "Jo", role: "counter", pin: "1234", code: "101" }, T0)).toThrow(/has left/);
  });

  test("staff saved before Staff IDs get one, oldest first", () => {
    const old = [
      { id: "b", name: "Sam", role: "driver", pinHash: pinHash("5678"), isActive: true, createdAt: 2 },
      { id: "a", name: "Ali", role: "kitchen", pinHash: pinHash("1234"), isActive: true, createdAt: 1 },
      { id: "c", code: "101", name: "Jo", role: "counter", pinHash: pinHash("1111"), isActive: true, createdAt: 3 },
    ];
    expect(withStaffIds(old).map((s) => [s.id, s.code])).toEqual([["b", "103"], ["a", "102"], ["c", "101"]]);
    const ready = withStaffIds(old);
    expect(withStaffIds(ready)).toBe(ready);
    expect(old[0].code).toBeUndefined();
  });

  test("updates name, role, Staff ID and PIN without touching the original list", () => {
    const staff = team();
    const [ali] = staff;
    const next = updateStaff(staff, ali.id, { name: "Ali K", role: "manager", pin: "4321", code: "300" });
    expect(next[0]).toMatchObject({ name: "Ali K", role: "manager", code: "300", pinHash: pinHash("4321") });
    expect(staff[0].name).toBe("Ali Khan");
  });

  test("an empty PIN or ID on update keeps the old one; another's ID is refused", () => {
    const staff = team();
    expect(updateStaff(staff, staff[0].id, { pin: "", code: "" })[0]).toMatchObject({ pinHash: pinHash("1234"), code: "101" });
    expect(updateStaff(staff, staff[0].id, { pin: "5678" })[0].pinHash).toBe(pinHash("5678"));
    expect(updateStaff(staff, staff[0].id, { code: "101" })[0].code).toBe("101");
    expect(() => updateStaff(staff, staff[0].id, { code: "102" })).toThrow(/belongs to Sam/);
    expect(() => updateStaff(staff, "nope", { name: "X" })).toThrow(/no longer exists/);
  });

  test("clocking in needs the right Staff ID and PIN together", () => {
    const staff = team();
    expect(findByIdAndPin(staff, "102", "5678").name).toBe("Sam");
    expect(findByIdAndPin(staff, "101", "5678")).toBeNull();
    expect(findByIdAndPin(staff, "999", "5678")).toBeNull();
    expect(findByIdAndPin(staff, "102", "abc")).toBeNull();
    expect(isValidPin("0042")).toBe(true);
    expect(isValidStaffId("100")).toBe(true);
    expect(isValidStaffId("1000")).toBe(false);
  });
});

describe("shifts", () => {
  test("clock in, then out, records one closed shift", () => {
    let shifts = clockIn([], "a", T0);
    expect(openShift(shifts, "a")).toMatchObject({ startAt: T0, endAt: null });
    shifts = clockOut(shifts, "a", T0 + 90 * MIN);
    expect(openShift(shifts, "a")).toBeNull();
    expect(shiftMinutes(shifts[0], T0)).toBe(90);
  });

  test("cannot clock in twice or out without clocking in", () => {
    const shifts = clockIn([], "a", T0);
    expect(() => clockIn(shifts, "a", T0 + MIN)).toThrow(/Already clocked in/);
    expect(() => clockOut([], "a", T0)).toThrow(/Not clocked in/);
  });

  test("marks a shift the manager closed", () => {
    const shifts = clockOut(clockIn([], "a", T0), "a", T0 + MIN, "manager");
    expect(shifts[0].closedBy).toBe("manager");
  });

  test("an open shift counts up to now and is flagged when very long", () => {
    const [shift] = clockIn([], "a", T0);
    expect(shiftMinutes(shift, T0 + 125 * MIN)).toBe(125);
    expect(isLongShift(shift, T0 + 13 * 60 * MIN)).toBe(false);
    expect(isLongShift(shift, T0 + 15 * 60 * MIN)).toBe(true);
  });

  test("a clock-out earlier than the clock-in (device clock moved) never goes negative", () => {
    const shifts = clockOut(clockIn([], "a", T0), "a", T0 - MIN);
    expect(shiftMinutes(shifts[0], T0)).toBe(0);
  });
});

describe("timesheets", () => {
  test("formats durations", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(425)).toBe("7h 05m");
  });

  test("weeks run Monday to Monday", () => {
    const wednesday = new Date(2026, 9, 7, 15, 30).getTime();
    expect(weekStart(wednesday)).toBe(new Date(2026, 9, 5).getTime());
    expect(weekStart(new Date(2026, 9, 11, 23, 0).getTime())).toBe(new Date(2026, 9, 5).getTime()); // Sunday
    expect(weekEnd(weekStart(wednesday))).toBe(new Date(2026, 9, 12).getTime());
  });

  test("totals each person's shifts inside the range", () => {
    const [ali, sam] = team();
    let shifts = clockIn([], ali.id, T0);
    shifts = clockOut(shifts, ali.id, T0 + 8 * 60 * MIN);
    shifts = clockIn(shifts, ali.id, T0 + 24 * 60 * MIN);
    shifts = clockOut(shifts, ali.id, T0 + 24 * 60 * MIN + 30 * MIN);
    shifts = clockIn(shifts, ali.id, T0 + 8 * 24 * 60 * MIN); // next week
    const rows = timesheet([ali, sam], shifts, weekStart(T0), weekEnd(weekStart(T0)), T0 + 9 * 24 * 60 * MIN);
    expect(rows.map((r) => [r.name, r.minutes, r.shifts.length])).toEqual([
      ["Ali Khan", 510, 2],
      ["Sam", 0, 0],
    ]);
  });

  test("keeps a removed member only if they worked in the range", () => {
    const [ali, sam] = team();
    const staff = removeStaff([ali, sam], sam.id);
    expect(timesheet(staff, [], T0, T0 + MIN, T0).map((r) => r.name)).toEqual(["Ali Khan"]);
  });

  test("exports a CSV, quoting commas and defusing formulas", () => {
    let staff = addStaff([], { name: "=SUM(A1), boss", role: "manager", pin: "1111" }, T0);
    let shifts = clockOut(clockIn([], staff[0].id, T0), staff[0].id, T0 + 90 * MIN, "manager");
    shifts = clockIn(shifts, staff[0].id, T0 + 120 * MIN);
    const csv = timesheetCsv(timesheet(staff, shifts, T0, T0 + 1e9, T0 + 150 * MIN), T0 + 150 * MIN);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Staff ID,Name,Role,Clock in,Clock out,Hours,Note");
    expect(lines[1]).toBe(`101,"'=SUM(A1), boss",Manager,2026-10-05 09:00,2026-10-05 10:30,1.50,clocked out by manager`);
    expect(lines[2]).toContain("still clocked in,0.50,");
  });
});

describe("correcting a shift", () => {
  const HOUR = 60 * MIN;
  const open = clockIn([], "a", T0);

  test("a forgotten clock-out gets its real end time", () => {
    const fixed = correctShift(open, open[0].id, { startAt: T0, endAt: T0 + 8 * HOUR }, T0 + 20 * HOUR);
    expect(fixed[0]).toMatchObject({ startAt: T0, endAt: T0 + 8 * HOUR, closedBy: "manager", isCorrected: true });
    expect(open[0].endAt).toBeNull();
  });

  test("the end must come after the start, and not in the future", () => {
    expect(() => correctShift(open, open[0].id, { startAt: T0, endAt: T0 }, T0 + HOUR)).toThrow(/after/);
    expect(() => correctShift(open, open[0].id, { startAt: T0, endAt: T0 + 2 * HOUR }, T0 + HOUR)).toThrow(/future/);
  });

  test("a shift longer than a day is refused", () => {
    expect(() => correctShift(open, open[0].id, { startAt: T0, endAt: T0 + 25 * HOUR }, T0 + 30 * HOUR)).toThrow(/24 hours/);
  });

  test("it cannot overlap the same person's other shifts", () => {
    const later = clockIn(clockOut(open, "a", T0 + 2 * HOUR), "a", T0 + 3 * HOUR);
    expect(() => correctShift(later, later[0].id, { startAt: T0, endAt: T0 + 4 * HOUR }, T0 + 5 * HOUR)).toThrow(/overlap/);
  });

  test("the timesheet CSV notes the correction", () => {
    const staff = addStaff([], { name: "Ali", role: "kitchen", pin: "1234" }, T0);
    const shifts = clockIn([], staff[0].id, T0);
    const fixed = correctShift(shifts, shifts[0].id, { startAt: T0, endAt: T0 + 8 * HOUR }, T0 + 20 * HOUR);
    const csv = timesheetCsv(timesheet(staff, fixed, T0, T0 + 1e9, T0 + 20 * HOUR), T0 + 20 * HOUR);
    expect(csv).toContain("times corrected by manager");
  });
});
