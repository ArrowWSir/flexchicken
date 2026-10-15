"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { getRepo, IS_CLOUD } from "../lib/store";
import { PrinterUnreachable, STATUS_CHECK, sendToEpson } from "../lib/eposDirect";
import { isThisTill, setTillReach, subscribeTill } from "../lib/tillPrinter";
import { usePrinter } from "./usePrinter";
import { useSettings } from "./useShop";

// How often the till looks for the printer when nothing is waiting.
const CHECK_EVERY_MS = 10_000;
// The website hears "the printer is there" at most this often.
const CHECK_IN_EVERY_MS = 20_000;
// Receipts sent in one go, so a fault can never loop forever.
const MAX_PER_ROUND = 20;
// Tries at handing in one report before the till lets it go.
const MAX_REPORT_TRIES = 5;

/** True when this device is the till (Admin → Shop → Receipt printer). */
export function useIsThisTill() {
  return useSyncExternalStore(subscribeTill, isThisTill, () => false);
}

// How the send went, in the words the website takes (reportReceipt).
async function printOne(address, document) {
  try {
    return { outcome: "answered", responseFile: await sendToEpson(address, document) };
  } catch (err) {
    if (!(err instanceof PrinterUnreachable)) throw err;
    setTillReach("unreachable", Date.now());
    return { outcome: err.isUnsure ? "unsure" : "unreached" };
  }
}

/**
 * One round: hand in a report that did not get through last time; check the
 * printer is there; then send every waiting receipt. `relay` holds what
 * lasts between rounds: the address, the last check-in, an undelivered report.
 */
async function round(relay) {
  const repo = getRepo();
  // Until the website has heard how the last receipt went, it holds the
  // queue. A report it keeps refusing is dropped: its 90 s wait settles it.
  if (relay.unsent) {
    const { jobId, report } = relay.unsent;
    relay.unsent = relay.unsent.tries >= MAX_REPORT_TRIES ? null : { ...relay.unsent, tries: relay.unsent.tries + 1 };
    await repo.reportReceipt(jobId, report);
    relay.unsent = null;
  }
  const address = relay.address;
  try {
    await sendToEpson(address, STATUS_CHECK);
  } catch (err) {
    if (!(err instanceof PrinterUnreachable)) throw err;
    // Receipts stay waiting on the website and go when the printer is back.
    setTillReach("unreachable", Date.now());
    return;
  }
  setTillReach("ok", Date.now());
  if (Date.now() - relay.lastCheckIn >= CHECK_IN_EVERY_MS) {
    await repo.tillPrinterCheckIn();
    relay.lastCheckIn = Date.now();
  }
  if (!relay.hasWaiting) return;
  for (let i = 0; i < MAX_PER_ROUND && address === relay.address; i++) {
    const job = await repo.claimReceipt();
    if (!job) return;
    const report = await printOne(address, job.document);
    relay.unsent = { jobId: job.jobId, report, tries: 1 };
    await repo.reportReceipt(job.jobId, report);
    relay.unsent = null;
    if (report.outcome !== "answered") return;
  }
}

// The till's screen stays on while it sends receipts: a sleeping Chrome tab
// stops its timers, and receipts would wait.
function useWakeLock(isOn) {
  useEffect(() => {
    if (!isOn || !navigator.wakeLock) return undefined;
    let lock = null;
    let isLive = true;
    const take = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (!isLive) lock.release();
      } catch {
        // Refused (battery saver): the screen timeout in Android settings decides.
      }
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      isLive = false;
      document.removeEventListener("visibilitychange", take);
      lock?.release().catch(() => {});
    };
  }, [isOn]);
}

/**
 * On the till, while a staff screen is open: sends the receipts waiting on
 * the website to the Epson printer on the shop's network, and tells the
 * website the printer is there. Does nothing on any other screen.
 */
export function useTillPrinterRelay() {
  const settings = useSettings();
  const printer = usePrinter();
  const isTill = useIsThisTill();
  const { address } = printer;
  const isOn = IS_CLOUD && isTill && settings.receiptPrinter === "till" && Boolean(address);
  const waiting = printer.jobs.filter((j) => j.status === "waiting").map((j) => j.id).join(",");
  const relay = useRef({ address, hasWaiting: false, lastCheckIn: 0, unsent: null, isBusy: false, isAgain: false });

  useWakeLock(isOn);

  useEffect(() => {
    relay.current.address = address;
    relay.current.hasWaiting = waiting !== "";
  }, [address, waiting]);

  useEffect(() => {
    if (!isOn) return undefined;
    const state = relay.current;
    const go = async () => {
      // A round already going takes one more turn after it, not two at once.
      if (state.isBusy) {
        state.isAgain = true;
        return;
      }
      state.isBusy = true;
      try {
        do {
          state.isAgain = false;
          await round(state);
        } while (state.isAgain);
      } catch {
        // The website did not answer or said no (offline, signed out, the
        // owner changed the printer): the next round tries again.
        setTillReach("error", Date.now());
      } finally {
        state.isBusy = false;
      }
    };
    go();
    const timer = setInterval(go, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [isOn, address, waiting]);
}
