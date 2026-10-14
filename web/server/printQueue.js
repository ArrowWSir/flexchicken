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
import { pinMatches } from "./auth.js";
import { formatOrderNumber } from "../app/lib/orders.js";
import { buildReceipt } from "../app/lib/receipt.js";
import { receiptEpos, testReceiptEpos } from "../app/lib/receiptEpos.js";
import { readTokens, tokenProblem } from "../app/lib/stampTokens.js";

export const JOBS = "print_jobs"; // one row per receipt (sqlStore COLLECTIONS)
export const STATUS = "printer_status"; // { lastSeenAt }
export const KEY = "printer_key"; // { key, createdAt }: never sent to any screen
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

  /** True when the owner chose the network printer in Admin → Shop. */
  const isOn = () => repo.getSettings().receiptPrinter === "network";

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

  /**
   * The printer asking for work. Returns the XML to send back, or "" for
   * nothing to print. `origin` is this site's address, for the stamp link.
   */
  function poll(origin) {
    const at = now();
    const status = store.read(STATUS, {});
    if (!status.lastSeenAt || at - status.lastSeenAt >= SEEN_EVERY_MS) store.write(STATUS, { lastSeenAt: at });
    const before = listJobs();
    let jobs = settleOld(before, at);
    let body = "";
    // Nothing goes out while one is out, nor in the same answer that gave up
    // on one: a late result for it then finds nothing to be mistaken for.
    const gaveUp = jobs.some((j, i) => j.status === "unconfirmed" && before[i].status === "sent");
    if (!gaveUp && !jobs.some((j) => j.status === "sent")) {
      const next = jobs.find((j) => j.status === "waiting");
      const document = next ? documentFor({ ...next, origin }) : null;
      if (next && document) {
        jobs = withChanges(jobs, next.id, { status: "sent", sentAt: at });
        body = printRequestXml(document);
      } else if (next) {
        jobs = withChanges(jobs, next.id, { status: "failed", doneAt: at, problem: "That order no longer exists." });
      }
    }
    if (jobs.some((j, i) => j !== before[i])) saveJobs(jobs);
    return body;
  }

  /** The printer reporting how the receipt it took went. */
  function result(responseFile) {
    const out = listJobs().filter((j) => j.status === "sent").at(-1);
    if (!out) return;
    const { isPrinted, problem } = readPrintResult(responseFile);
    saveJobs(withChanges(listJobs(), out.id, { status: isPrinted ? "printed" : "failed", doneAt: now(), problem }));
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
    /** The key, made the first time the owner asks for it. */
    ensureKey: () => readKey() ?? newKey(),
    resetKey: newKey,
    keyMatches: (given) => {
      const key = readKey();
      return Boolean(key) && pinMatches(String(given ?? ""), key);
    },
  };
}
