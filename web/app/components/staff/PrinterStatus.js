"use client";
import { Printer, RotateCcw } from "lucide-react";
import { getRepo } from "../../lib/store";
import { formatTime } from "../../lib/receipt";
import { printerHealth } from "../../lib/receiptPrinter";
import { usePrinter } from "../../hooks/usePrinter";

const reprint = (orderId) => getRepo().printReceipt(orderId).catch((err) => window.alert(err.message));

const LABELS = {
  ready: "Printer ready",
  offline: "Printer offline",
  never: "Printer not connected yet",
};

/**
 * The network receipt printer on the orders board: a quiet line while all
 * is well; a red one when it is offline or a receipt did not come out, with
 * Reprint beside each receipt that failed.
 */
export default function PrinterStatus({ now }) {
  const health = printerHealth(usePrinter(), now);
  const isWell = health.state === "ready" && health.problems.length === 0;
  const waiting = health.waiting > 0 ? ` · ${health.waiting} receipt${health.waiting === 1 ? "" : "s"} waiting` : "";

  if (isWell) {
    return (
      <p role="status" className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-cream/70">
        <span className="size-2 rounded-full bg-[#8fdc7f]" aria-hidden="true" />
        {LABELS.ready}
        {waiting}
      </p>
    );
  }

  const why =
    health.state === "never"
      ? "It has not checked in with the website. The owner sets it up in Admin → Shop → Receipt printer."
      : health.state === "offline"
        ? `Last heard from at ${formatTime(health.lastSeenAt)}. Check its power, network cable and paper. Receipts wait and print when it is back.`
        : null;

  return (
    <section role="alert" aria-label="Receipt printer" className="mb-4 rounded-2xl bg-flex/20 px-4 py-3 ring-1 ring-flex/50">
      <p className="flex items-center gap-2 text-[14px] font-bold text-flame-light">
        <Printer className="size-4 shrink-0" aria-hidden="true" />
        {health.state === "ready" ? "A receipt did not print" : LABELS[health.state]}
        {waiting}
      </p>
      {why && <p className="mt-1 text-[12.5px] text-cream/80">{why}</p>}
      {health.problems.length > 0 && (
        <ul className="mt-2 grid gap-2">
          {health.problems.map((p) => (
            <li key={p.jobId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/20 px-3 py-2 text-[13px]">
              <span>
                <span className="font-bold">{p.number ? `Order ${p.number}` : "Test slip"}</span>
                <span className="text-cream/80"> · {p.message}</span>
              </span>
              {p.orderId && (
                <button
                  type="button"
                  onClick={() => reprint(p.orderId)}
                  className="press flex h-9 items-center gap-1.5 rounded-lg bg-cream px-3 text-[12.5px] font-bold text-roast-900"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Print again
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
