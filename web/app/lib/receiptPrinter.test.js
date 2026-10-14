import { describe, expect, test } from "vitest";
import { EMPTY_PRINTER, OFFLINE_AFTER_MS, printerHealth, readPrinter } from "./receiptPrinter";

const NOW = Date.UTC(2026, 9, 14, 19, 0);
const job = (over = {}) => ({ id: "pj_1", orderId: "ord_1", number: "#0001", reason: "accepted", status: "printed", createdAt: NOW - 60_000, problem: null, ...over });

describe("readPrinter", () => {
  test("anything but an object is an empty printer", () => {
    expect(readPrinter(null)).toBe(EMPTY_PRINTER);
    expect(readPrinter("x")).toBe(EMPTY_PRINTER);
  });

  test("drops malformed jobs and keeps the rest", () => {
    const printer = readPrinter({ lastSeenAt: NOW, jobs: [job(), { id: 3 }, job({ id: "pj_2", status: "lost" })] });
    expect(printer.jobs.map((j) => j.id)).toEqual(["pj_1"]);
    expect(printer.lastSeenAt).toBe(NOW);
  });
});

describe("printerHealth", () => {
  test("ready while the printer keeps checking in", () => {
    expect(printerHealth({ lastSeenAt: NOW - 10_000, jobs: [] }, NOW).state).toBe("ready");
  });

  test("offline after a minute without a word", () => {
    expect(printerHealth({ lastSeenAt: NOW - OFFLINE_AFTER_MS - 1, jobs: [] }, NOW).state).toBe("offline");
  });

  test("never, until the printer first checks in", () => {
    expect(printerHealth(EMPTY_PRINTER, NOW).state).toBe("never");
  });

  test("counts receipts waiting for the printer", () => {
    const health = printerHealth({ lastSeenAt: null, jobs: [job({ status: "waiting" }), job({ id: "pj_2", status: "waiting" }), job({ id: "pj_3" })] }, NOW);
    expect(health.waiting).toBe(2);
  });

  test("lists a receipt that failed, with the printer's reason", () => {
    const health = printerHealth({ lastSeenAt: NOW, jobs: [job({ status: "failed", problem: "The printer is out of paper." })] }, NOW);
    expect(health.problems).toEqual([{ jobId: "pj_1", orderId: "ord_1", number: "#0001", message: "The printer is out of paper." }]);
  });

  test("a later copy that printed settles the failure", () => {
    const jobs = [job({ status: "failed" }), job({ id: "pj_2", reason: "reprint", createdAt: NOW - 10_000 })];
    expect(printerHealth({ lastSeenAt: NOW, jobs }, NOW).problems).toEqual([]);
  });

  test("old failures drop off the board", () => {
    const jobs = [job({ status: "expired", createdAt: NOW - 4 * 3_600_000 })];
    expect(printerHealth({ lastSeenAt: NOW, jobs }, NOW).problems).toEqual([]);
  });
});
