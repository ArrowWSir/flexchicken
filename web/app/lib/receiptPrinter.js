// What the staff screens show about the network receipt printer: is it
// there, and did any receipt fail to come out. The server keeps the queue
// (server/printQueue.js); this reads the "printer" topic it shares. Pure.

// The printer asks every few seconds and the server passes that on at most
// every 20 s, so a minute of silence means it is off, unplugged or offline.
export const OFFLINE_AFTER_MS = 60_000;
// A failed receipt stays on the board this long, unless printed again.
const PROBLEM_SHOWN_MS = 3 * 3_600_000;
const JOB_STATUSES = new Set(["waiting", "sent", "printed", "failed", "unconfirmed", "expired"]);
const PROBLEM_STATUSES = new Set(["failed", "unconfirmed", "expired"]);
const OK_OR_ON_ITS_WAY = new Set(["waiting", "sent", "printed"]);

export const EMPTY_PRINTER = Object.freeze({ lastSeenAt: null, jobs: Object.freeze([]) });

const isTime = (value) => Number.isFinite(value) && value > 0;

/** The printer topic as the server sent it, dropping anything malformed. */
export function readPrinter(saved) {
  if (!saved || typeof saved !== "object") return EMPTY_PRINTER;
  const jobs = Array.isArray(saved.jobs)
    ? saved.jobs
        .filter((j) => j && typeof j.id === "string" && JOB_STATUSES.has(j.status) && isTime(j.createdAt))
        .map((j) => ({
          id: j.id,
          orderId: typeof j.orderId === "string" ? j.orderId : null,
          number: typeof j.number === "string" ? j.number : null,
          reason: typeof j.reason === "string" ? j.reason : "accepted",
          status: j.status,
          createdAt: j.createdAt,
          problem: typeof j.problem === "string" ? j.problem : null,
        }))
    : [];
  return { lastSeenAt: isTime(saved.lastSeenAt) ? saved.lastSeenAt : null, jobs };
}

/**
 * The printer at a glance.
 * @returns {{ state: "ready" | "offline" | "never", lastSeenAt: number | null, waiting: number,
 *   problems: { jobId: string, orderId: string | null, number: string | null, message: string }[] }}
 */
export function printerHealth(printer, now) {
  const { lastSeenAt, jobs } = readPrinter(printer);
  const state = lastSeenAt === null ? "never" : now - lastSeenAt > OFFLINE_AFTER_MS ? "offline" : "ready";
  // A receipt printed (or on its way) after a failure for the same order
  // settles it: staff tapped Reprint and it came out.
  const settled = (failed) => jobs.some((j) => j.orderId === failed.orderId && j.createdAt > failed.createdAt && OK_OR_ON_ITS_WAY.has(j.status));
  const problems = jobs
    .filter((j) => PROBLEM_STATUSES.has(j.status) && now - j.createdAt <= PROBLEM_SHOWN_MS && !settled(j))
    .map((j) => ({ jobId: j.id, orderId: j.orderId, number: j.number, message: j.problem ?? "It did not print." }));
  return { state, lastSeenAt, waiting: jobs.filter((j) => j.status === "waiting").length, problems };
}
