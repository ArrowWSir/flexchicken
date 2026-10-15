// Receipts for the shop's network printer: an Epson TM-m30II/III set to
// Server Direct Print. The printer, not the till, does the asking: every few
// seconds it POSTs to /api/printer ("anything to print?"), takes at most one
// receipt, prints it, then POSTs the result. So accepting an order prints the
// ticket whatever screen accepted it, and nothing needs pairing.
//
// Protocol (Epson Server Direct Print User's Manual, M00062910):
//   printer -> ConnectionType=GetRequest&ID=..          (form data)
//   server  -> <PrintRequestInfo><ePOSPrint>..          (text/xml), or empty
//   printer -> ConnectionType=SetResponse&ID=..&ResponseFile=<PrintResponseInfo>..
//
// One receipt per answer, and none while one is out: the result that comes
// back then belongs to that receipt without needing job ids, which older
// firmware does not support.
//
// A plain TM-m30II has no Server Direct Print. For it the till does the
// asking ("till" mode): its open staff screen claims the next receipt here,
// sends it to the printer over the shop's network (lib/eposDirect.js) and
// reports how it went. Same queue, same one-at-a-time rule.
import { pinMatches } from "./auth.js";
import { formatOrderNumber } from "../app/lib/orders.js";
import { buildReceipt } from "../app/lib/receipt.js";
import { receiptEpos, testReceiptEpos } from "../app/lib/receiptEpos.js";
import { QUEUED_PRINTERS } from "../app/lib/settings.js";
import { readTokens, tokenProblem } from "../app/lib/stampTokens.js";

export const JOBS = "print_jobs"; // one row per receipt (sqlStore COLLECTIONS)
export const STATUS = "printer_status"; // { lastSeenAt }
export const KEY = "printer_key"; // { key, createdAt }: never sent to any screen
export const ADDRESS = "printer_address"; // { address }: the printer's IP on the shop's network
// The topic screens subscribe to; it is JOBS and STATUS together.
export const PRINTER_TOPIC = "printer";

const KEPT_JOBS = 200;
const JOBS_SHOWN = 40;
// The printer checks in every 5 s; screens hear about it at most this often.
const SEEN_EVERY_MS = 20_000;
// A receipt the printer took but never reported on.
const SENT_TIMEOUT_MS = 90_000;
// Not printed within the hour (printer off): a ticket that late only confuses the kitchen.
const STALE_MS = 3_600_000;
const PRINT_TIMEOUT_MS = 10_000;
// Times the till may find the printer gone mid-send before the receipt fails.
const TILL_TRIES = 3;
const KEY_BYTES = 24;

const EPOS_PROBLEMS = {
  EPTR_COVER_OPEN: "The printer's cover is open.",
  EPTR_REC_EMPTY: "The printer is out of paper.",
  EPTR_AUTOCUTTER: "The paper cutter is stuck. Open the cover and clear it.",
  EPTR_MECHANICAL: "The printer has a mechanical fault. Switch it off and on.",
  EPTR_UNRECOVERABLE: "The printer needs switching off and on.",
  EX_TIMEOUT: "The printer did not answer in time.",
  DeviceNotFound: "The printer could not find its paper unit.",
  SchemaError: "The printer could not read this receipt.",
  ParameterError: "The printer could not read this receipt.",
};

const defaultKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** The printer's answer: did it print, and if not, why, in the shop's words. */
export function readPrintResult(responseFile) {
  const tag = /<response\b[^>]*>/.exec(String(responseFile ?? ""))?.[0];
  if (!tag) return { isPrinted: false, problem: "The printer's answer could not be read." };
  if (/\bsuccess="true"/.test(tag)) return { isPrinted: true, problem: null };
  const code = /\bcode="([^"]*)"/.exec(tag)?.[1] ?? "";
  return { isPrinted: false, problem: EPOS_PROBLEMS[code] ?? `The printer could not print it${code ? ` (${code.slice(0, 40)})` : ""}.` };
}

// A private IPv4 address (10/8, 172.16/12, 192.168/16): the printer sits on
// the shop's own network, and the address goes into the staff pages' CSP.
const PRIVATE_IPV4 = /^(10\.\d{1,3}|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}$/;

/** The printer's address as typed by the owner, or an error in their words. */
export function cleanPrinterAddress(value) {
  const address = String(value ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const isValid = PRIVATE_IPV4.test(address) && address.split(".").every((part) => Number(part) <= 255 && String(Number(part)) === part);
  if (!isValid) throw new Error("Enter the printer's IP address as it prints on its status sheet, like 192.168.1.172.");
  return address;
}

/** The answer to the printer: one ePOS-Print document for its own paper unit. */
export const printRequestXml = (eposDocument) =>
  `<?xml version="1.0" encoding="utf-8"?><PrintRequestInfo><ePOSPrint><Parameter><devid>local_printer</devid><timeout>${PRINT_TIMEOUT_MS}</timeout></Parameter><PrintData>${eposDocument}</PrintData></ePOSPrint></PrintRequestInfo>`;

/**
 * @param {{ store: { read: Function, write: Function }, repo: object, now: () => number,
 *   newId: (prefix: string) => string, randomKey?: () => string }} deps
 */
export function createPrintQueue({ store, repo, now, newId, randomKey = defaultKey }) {
  const listJobs = () => store.read(JOBS, []);
  const saveJobs = (jobs) => store.write(JOBS, jobs.slice(-KEPT_JOBS));
  const withChanges = (jobs, id, changes) => jobs.map((j) => (j.id === id ? { ...j, ...changes } : j));

  const mode = () => repo.getSettings().receiptPrinter;
  /** True when the owner chose an Epson printer in Admin → Shop, so receipts queue here. */
  const isOn = () => QUEUED_PRINTERS.includes(mode());
  const readAddress = () => store.read(ADDRESS, null)?.address ?? null;

  /**
   * Puts a receipt in the queue. `order` null is the owner's test slip.
   * The stamp code is minted now, so a reprint carries the same QR.
   */
  function enqueue(order, reason) {
    // A double tap: the copy already on its way will do.
    const pending = order && listJobs().find((j) => j.orderId === order.id && (j.status === "waiting" || j.status === "sent"));
    if (pending) return { id: pending.id, number: pending.number };
    const job = {
      id: newId("pj"),
      orderId: order?.id ?? null,
      number: order ? formatOrderNumber(order.number) : null,
      reason,
      token: order ? repo.issueStampToken(order.id) : null,
      status: "waiting",
      createdAt: now(),
      sentAt: null,
      doneAt: null,
      problem: null,
    };
    saveJobs([...listJobs(), job]);
    return { id: job.id, number: job.number };
  }

  /** What staff screens see: no stamp codes, only the latest receipts. */
  const view = () => ({
    lastSeenAt: store.read(STATUS, {}).lastSeenAt ?? null,
    address: readAddress(),
    jobs: settleOld(listJobs(), now())
      .slice(-JOBS_SHOWN)
      .map(({ id, orderId, number, reason, status, createdAt, problem }) => ({ id, orderId, number, reason, status, createdAt, problem })),
  });

  // Receipts whose time has passed: out too long without word, or never sent.
  function settleOld(jobs, at) {
    return jobs.map((j) => {
      if (j.status === "sent" && at - j.sentAt > SENT_TIMEOUT_MS) {
        return { ...j, status: "unconfirmed", doneAt: at, problem: "The printer took it but never said it printed. Check it came out." };
      }
      if (j.status === "waiting" && at - j.createdAt > STALE_MS) {
        return { ...j, status: "expired", doneAt: at, problem: "Not printed: the printer was off for over an hour." };
      }
      return j;
    });
  }

  function documentFor(job) {
    if (!job.orderId) return testReceiptEpos(job.createdAt);
    const order = repo.getOrder(job.orderId);
    if (!order) return null;
    // A copy printed after the stamp was collected, or for a cancelled
    // order, leaves the QR off rather than print a dead code.
    const isStampLive = job.token && order.status !== "cancelled" && !tokenProblem(readTokens(store.read("stamp_tokens", [])), job.token, now());
    return receiptEpos(buildReceipt(order, job.createdAt), { stampUrl: isStampLive ? `${job.origin}/stamp?t=${job.token}` : null });
  }

  // The printer (or the till for it) is alive; screens hear of it at most every SEEN_EVERY_MS.
  function markSeen(at) {
    const status = store.read(STATUS, {});
    if (!status.lastSeenAt || at - status.lastSeenAt >= SEEN_EVERY_MS) store.write(STATUS, { lastSeenAt: at });
  }

  /**
   * The next receipt to print, marked as out by `sentBy` ("printer" or
   * "till"), or null. `origin` is this site's address, for the stamp link.
   */
  function takeNext(origin, sentBy) {
    const at = now();
    const before = listJobs();
    let jobs = settleOld(before, at);
    let taken = null;
    // Nothing goes out while one is out, nor in the same answer that gave up
    // on one: a late result for it then finds nothing to be mistaken for.
    const gaveUp = jobs.some((j, i) => j.status === "unconfirmed" && before[i].status === "sent");
    if (!gaveUp && !jobs.some((j) => j.status === "sent")) {
      // A receipt whose order is gone fails, and the one after it goes instead.
      for (const next of jobs.filter((j) => j.status === "waiting")) {
        const document = documentFor({ ...next, origin });
        if (document) {
          jobs = withChanges(jobs, next.id, { status: "sent", sentAt: at, sentBy });
          taken = { jobId: next.id, document };
          break;
        }
        jobs = withChanges(jobs, next.id, { status: "failed", doneAt: at, problem: "That order no longer exists." });
      }
    }
    if (jobs.some((j, i) => j !== before[i])) saveJobs(jobs);
    return taken;
  }

  /**
   * The printer asking for work (Server Direct Print). Returns the XML to
   * send back, or "" for nothing to print.
   */
  function poll(origin) {
    markSeen(now());
    const taken = takeNext(origin, "printer");
    return taken ? printRequestXml(taken.document) : "";
  }

  const settle = (id, { isPrinted, problem }) =>
    saveJobs(withChanges(listJobs(), id, { status: isPrinted ? "printed" : "failed", doneAt: now(), problem }));

  /** The printer reporting how the receipt it took went. A receipt the till took is not its to settle. */
  function result(responseFile) {
    const out = listJobs().filter((j) => j.status === "sent" && j.sentBy !== "till").at(-1);
    if (out) settle(out.id, readPrintResult(responseFile));
  }

  // Till mode: the till's staff screen speaks for the printer.
  const requireTill = () => {
    if (mode() !== "till") throw new Error("Receipts are not sent by the till. The owner chooses how they print in Admin → Shop.");
  };

  /** The till reached the printer just now. */
  function tillCheckIn() {
    requireTill();
    markSeen(now());
  }

  /** The till taking the next receipt: { jobId, document } (an ePOS-Print document), or null. */
  function claim(origin) {
    requireTill();
    markSeen(now());
    return takeNext(origin, "till");
  }

  /**
   * The till reporting a receipt it took. `outcome`: "answered" (the
   * printer's `responseFile` says how it went), "unreached" (nothing got to
   * the printer: it goes back in the queue, up to TILL_TRIES times) or
   * "unsure" (it may have printed: staff check, and print again if not).
   * The till retries a report it could not deliver, so a repeat is harmless.
   */
  function report(jobId, { outcome, responseFile = "" } = {}) {
    requireTill();
    const at = now();
    const jobs = settleOld(listJobs(), at);
    const job = jobs.find((j) => j.id === jobId);
    if (!job) throw new Error("That receipt is no longer in the queue.");
    // Settled already (or the 90 s wait ran out): the late answer changes nothing.
    if (job.status !== "sent") return saveJobs(jobs);
    if (outcome === "answered") {
      markSeen(at);
      const { isPrinted, problem } = readPrintResult(responseFile);
      return saveJobs(withChanges(jobs, job.id, { status: isPrinted ? "printed" : "failed", doneAt: at, problem }));
    }
    if (outcome === "unsure") {
      return saveJobs(withChanges(jobs, job.id, { status: "unconfirmed", doneAt: at, problem: "The printer may not have printed it. Check it came out." }));
    }
    const tries = (job.tries ?? 0) + 1;
    if (tries < TILL_TRIES) return saveJobs(withChanges(jobs, job.id, { status: "waiting", sentAt: null, sentBy: null, tries }));
    return saveJobs(
      withChanges(jobs, job.id, { status: "failed", doneAt: at, tries, problem: "The till could not reach the printer. Check it is on and plugged into the router." })
    );
  }

  /** The owner setting the printer's address on the shop's network. */
  function setAddress(value) {
    const address = cleanPrinterAddress(value);
    store.write(ADDRESS, { address });
    return { address };
  }

  /** Where staff pages may connect for the printer (their CSP), or none. */
  function connectOrigins() {
    const address = readAddress();
    return address ? [`https://${address}`, `http://${address}`] : [];
  }

  // The printer proves itself with a long random key in its URL, which the
  // owner copies from Admin → Shop. A new key cuts off the old URL.
  const readKey = () => store.read(KEY, null)?.key ?? null;
  const newKey = () => {
    const record = { key: randomKey(), createdAt: now() };
    store.write(KEY, record);
    return record.key;
  };

  return {
    isOn,
    enqueue,
    view,
    poll,
    result,
    tillCheckIn,
    claim,
    report,
    setAddress,
    connectOrigins,
    /** The key, made the first time the owner asks for it. */
    ensureKey: () => readKey() ?? newKey(),
    resetKey: newKey,
    keyMatches: (given) => {
      const key = readKey();
      return Boolean(key) && pinMatches(String(given ?? ""), key);
    },
  };
}
