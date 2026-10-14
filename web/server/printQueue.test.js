import { describe, expect, test } from "vitest";
import { createShopCore } from "./shopCore";
import { printRequestXml, readPrintResult } from "./printQueue";

function memoryStore() {
  const data = new Map();
  return {
    read: (key, fallback) => (data.has(key) ? structuredClone(data.get(key)) : fallback),
    write: (key, value) => data.set(key, structuredClone(value)),
    subscribe: () => () => {},
  };
}

const ORIGIN = "https://flexchicken.uk";
const PUBLIC = { role: "public", ip: "1.1.1.1" };
const ADMIN = { role: "admin", id: "kitchen", name: "Kitchen" };
const STAFF = { role: "staff", id: "staff", name: "Staff" };
const DRIVER = { role: "driver", id: "drv_sam", name: "Sam" };
const customer = { id: "usr_abc123", name: "Jo", email: "jo@example.com", phone: "07700 900123" };
const burger = { key: "x", itemId: 1155, name: "Chicken Fillet Burger", choices: [], unitPence: 1, qty: 1 };
const PRINTED = '<?xml version="1.0" encoding="utf-8"?><PrintResponseInfo><response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" code="" status="251854870" battery="0"/></PrintResponseInfo>';
const NO_PAPER = PRINTED.replace('success="true" code=""', 'success="false" code="EPTR_REC_EMPTY"');

function setup() {
  const store = memoryStore();
  let clock = Date.UTC(2026, 9, 8, 18, 0);
  let n = 0;
  const core = createShopCore({ store, now: () => clock, newId: (prefix) => `${prefix}_${++n}`, savePhoto: () => "" });
  const placeOrder = async () => (await core.call("placeOrder", [{ cart: { lines: [burger] }, customer, mode: "collection" }], PUBLIC)).result;
  const useNetworkPrinter = () => core.call("saveSettings", [{ receiptPrinter: "network" }], ADMIN);
  const accept = async (order, actor = STAFF) => core.call("advance", [order.id, "accepted"], actor);
  const view = (actor = STAFF) => core.snapshot(["printer"], actor).printer;
  return { core, store, placeOrder, useNetworkPrinter, accept, view, tick: (ms) => (clock += ms) };
}

describe("accepting an order", () => {
  test("queues its receipt when the owner chose the network printer", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    const order = await shop.placeOrder();
    const { changed } = await shop.accept(order);
    expect(changed).toContain("printer");
    expect(shop.view().jobs).toEqual([expect.objectContaining({ orderId: order.id, number: "#0001", reason: "accepted", status: "waiting" })]);
  });

  test("queues nothing while the till's screen prints", async () => {
    const shop = setup();
    const order = await shop.placeOrder();
    await shop.accept(order);
    expect(shop.view().jobs).toEqual([]);
  });

  test("starting to cook does not print again", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    const order = await shop.placeOrder();
    await shop.accept(order);
    await shop.core.call("advance", [order.id, "preparing"], STAFF);
    expect(shop.view().jobs).toHaveLength(1);
  });
});

describe("the printer asking for receipts", () => {
  test("gets the waiting receipt once, as an ePOS-Print request with the stamp QR", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    const order = await shop.placeOrder();
    await shop.accept(order);
    const { result: xml, changed } = shop.core.printer.poll(ORIGIN);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="utf-8"\?><PrintRequestInfo><ePOSPrint><Parameter><devid>local_printer<\/devid>/);
    expect(xml).toContain("#0001");
    expect(xml).toMatch(/<symbol type="qrcode_model_2"[^>]*>https:\/\/flexchicken\.uk\/stamp\?t=[A-Z2-9]{20}<\/symbol>/);
    expect(changed).toContain("printer");
    expect(shop.view().jobs[0].status).toBe("sent");
    expect(shop.core.printer.poll(ORIGIN).result).toBe("");
  });

  test("the printed receipt's stamp code is the order's, so a reprint cannot earn a second stamp", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    const order = await shop.placeOrder();
    await shop.accept(order);
    const first = shop.core.printer.poll(ORIGIN).result;
    shop.core.printer.result(PRINTED);
    await shop.core.call("printReceipt", [order.id], STAFF);
    const second = shop.core.printer.poll(ORIGIN).result;
    const qr = (xml) => /stamp\?t=([A-Z2-9]{20})/.exec(xml)[1];
    expect(qr(second)).toBe(qr(first));
  });

  test("sends one receipt at a time, the next after the printer reports", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    const a = await shop.placeOrder();
    const b = await shop.placeOrder();
    await shop.accept(a);
    await shop.accept(b);
    expect(shop.core.printer.poll(ORIGIN).result).toContain("#0001");
    expect(shop.core.printer.poll(ORIGIN).result).toBe("");
    shop.core.printer.result(PRINTED);
    expect(shop.core.printer.poll(ORIGIN).result).toContain("#0002");
    expect(shop.view().jobs.map((j) => j.status)).toEqual(["printed", "sent"]);
  });

  test("records why a receipt failed", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    await shop.accept(await shop.placeOrder());
    shop.core.printer.poll(ORIGIN);
    shop.core.printer.result(NO_PAPER);
    expect(shop.view().jobs[0]).toMatchObject({ status: "failed", problem: "The printer is out of paper." });
  });

  test("a receipt never reported on is flagged, and the queue moves on", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    await shop.accept(await shop.placeOrder());
    await shop.accept(await shop.placeOrder());
    shop.core.printer.poll(ORIGIN);
    shop.tick(2 * 60_000);
    // The answer that gives up on it sends nothing, so a late result for it is not taken for the next.
    expect(shop.core.printer.poll(ORIGIN).result).toBe("");
    expect(shop.view().jobs[0]).toMatchObject({ status: "unconfirmed" });
    expect(shop.core.printer.poll(ORIGIN).result).toContain("#0002");
  });

  test("a receipt an hour old is not printed when the printer comes back", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    await shop.accept(await shop.placeOrder());
    shop.tick(61 * 60_000);
    expect(shop.core.printer.poll(ORIGIN).result).toBe("");
    expect(shop.view().jobs[0]).toMatchObject({ status: "expired" });
  });

  test("tells the screens it is there, but not on every check", async () => {
    const shop = setup();
    expect(shop.core.printer.poll(ORIGIN).changed).toEqual(["printer"]);
    shop.tick(5000);
    expect(shop.core.printer.poll(ORIGIN).changed).toEqual([]);
    shop.tick(20_000);
    expect(shop.core.printer.poll(ORIGIN).changed).toEqual(["printer"]);
    expect(shop.view().lastSeenAt).toBeGreaterThan(0);
  });
});

describe("printer actions", () => {
  test("staff reprint into the queue; customers and drivers cannot", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    const order = await shop.placeOrder();
    await shop.accept(order);
    shop.core.printer.poll(ORIGIN);
    shop.core.printer.result(PRINTED);
    await shop.core.call("printReceipt", [order.id], STAFF);
    expect(shop.view().jobs.map((j) => j.reason)).toEqual(["accepted", "reprint"]);
    await expect(shop.core.call("printReceipt", [order.id], PUBLIC)).rejects.toMatchObject({ status: 403 });
    await expect(shop.core.call("printReceipt", [order.id], DRIVER)).rejects.toMatchObject({ status: 403 });
  });

  test("a double tap on reprint queues one copy", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    const order = await shop.placeOrder();
    await shop.core.call("printReceipt", [order.id], STAFF);
    await shop.core.call("printReceipt", [order.id], STAFF);
    expect(shop.view().jobs).toHaveLength(1);
  });

  test("a copy printed after the stamp was collected has no QR", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    const order = await shop.placeOrder();
    await shop.accept(order);
    const token = /stamp\?t=([A-Z2-9]{20})/.exec(shop.core.printer.poll(ORIGIN).result)[1];
    shop.core.printer.result(PRINTED);
    await shop.core.call("registerCard", [{ id: "fc_usr_cccccccccccccccccc", name: "Jo" }], PUBLIC);
    await shop.core.call("redeemStampToken", [token, "fc_usr_cccccccccccccccccc"], PUBLIC);
    await shop.core.call("printReceipt", [order.id], STAFF);
    const copy = shop.core.printer.poll(ORIGIN).result;
    expect(copy).toContain("#0001");
    expect(copy).not.toContain("<symbol");
  });

  test("staff see a receipt has expired even while the printer stays off", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    await shop.accept(await shop.placeOrder());
    shop.tick(61 * 60_000);
    expect(shop.view().jobs[0]).toMatchObject({ status: "expired" });
  });

  test("a reprint says so when the network printer is not chosen", async () => {
    const shop = setup();
    const order = await shop.placeOrder();
    await expect(shop.core.call("printReceipt", [order.id], STAFF)).rejects.toThrow(/not set up/);
  });

  test("the owner's test slip prints before the printer is chosen", async () => {
    const shop = setup();
    await shop.core.call("printTestReceipt", [], ADMIN);
    expect(shop.core.printer.poll(ORIGIN).result).toContain("PRINTER TEST");
    await expect(shop.core.call("printTestReceipt", [], STAFF)).rejects.toMatchObject({ status: 403 });
  });

  test("the printer link's key is the owner's alone, and a new one replaces the old", async () => {
    const shop = setup();
    const { result: first } = await shop.core.call("printerLink", [], ADMIN);
    expect(first.key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect((await shop.core.call("printerLink", [], ADMIN)).result.key).toBe(first.key);
    expect(shop.core.printer.keyMatches(first.key)).toBe(true);
    const { result: next } = await shop.core.call("resetPrinterLink", [], ADMIN);
    expect(shop.core.printer.keyMatches(first.key)).toBe(false);
    expect(shop.core.printer.keyMatches(next.key)).toBe(true);
    await expect(shop.core.call("printerLink", [], STAFF)).rejects.toMatchObject({ status: 403 });
  });

  test("no key matches before the owner makes one", () => {
    const shop = setup();
    expect(shop.core.printer.keyMatches("")).toBe(false);
    expect(shop.core.printer.keyMatches(undefined)).toBe(false);
  });

  test("only staff screens see the printer, and never the stamp codes", async () => {
    const shop = setup();
    await shop.useNetworkPrinter();
    await shop.accept(await shop.placeOrder());
    expect(shop.view(PUBLIC)).toBeNull();
    expect(shop.view(DRIVER)).toBeNull();
    expect(shop.view(ADMIN).jobs[0]).not.toHaveProperty("token");
  });
});

describe("readPrintResult", () => {
  test("reads success, a known fault and an unknown one", () => {
    expect(readPrintResult(PRINTED)).toEqual({ isPrinted: true, problem: null });
    expect(readPrintResult(NO_PAPER).problem).toBe("The printer is out of paper.");
    expect(readPrintResult(PRINTED.replace('success="true" code=""', 'success="false" code="EX_ODD"')).problem).toBe("The printer could not print it (EX_ODD).");
    expect(readPrintResult("nonsense").isPrinted).toBe(false);
  });
});

describe("printRequestXml", () => {
  test("wraps one document for the printer's own paper unit", () => {
    expect(printRequestXml("<epos-print/>")).toContain("<PrintData><epos-print/></PrintData>");
  });
});
