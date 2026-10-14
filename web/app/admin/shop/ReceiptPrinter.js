"use client";
import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { getRepo, IS_CLOUD } from "../../lib/store";
import { formatTime } from "../../lib/receipt";
import { printerHealth } from "../../lib/receiptPrinter";
import { usePrinter } from "../../hooks/usePrinter";

const COPIED_MS = 2000;
// How often the printer asks for receipts: a ticket prints within this.
const POLL_SECONDS = 5;

const CHOICES = [
  { id: "screen", label: "This screen's print dialog", hint: "A printer set up on the till itself (USB, or the till's own)." },
  { id: "network", label: "Epson printer on the network", hint: "TM-m30II or TM-m30III with a network cable or Wi-Fi. Prints with nothing set up on the till." },
];

const STATE_TEXT = {
  ready: "Connected: the printer checked in just now.",
  offline: "Offline: not heard from since",
  never: "Waiting: the printer has not checked in yet. Follow the steps below.",
};

function PrinterLink() {
  const [key, setKey] = useState(null);
  const [error, setError] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  useEffect(() => {
    getRepo()
      .printerLink()
      .then(({ key: k }) => setKey(k))
      .catch((err) => setError(err.message));
  }, []);
  const url = key ? `${window.location.origin}/api/printer?key=${key}` : "";
  const copy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), COPIED_MS);
    } catch {
      setError("Copying is blocked here. Select the link and copy it by hand.");
    }
  };
  const reset = async () => {
    if (!window.confirm("Make a new printer link? The printer stops printing until its settings have the new link.")) return;
    setError("");
    try {
      setKey((await getRepo().resetPrinterLink()).key);
    } catch (err) {
      setError(err.message);
    }
  };
  const problem = error && <p role="alert" className="text-[13px] text-flame-light">{error}</p>;
  if (!key) return problem || <p className="text-[13px] text-cream/60">Loading the printer link…</p>;
  return (
    <div className="grid gap-2">
      {problem}
      <p className="break-all rounded-xl bg-black/30 px-3 py-2.5 font-mono text-[12.5px] text-cream ring-1 ring-cream/15">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="press flex h-10 items-center gap-2 rounded-xl bg-cream px-4 text-[13px] font-bold text-roast-900">
          {isCopied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {isCopied ? "Copied" : "Copy link"}
        </button>
        <button type="button" onClick={reset} className="press flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-cream/80 ring-1 ring-cream/20 hover:bg-cream/10">
          <RefreshCw className="size-4" aria-hidden="true" />
          New link
        </button>
      </div>
      <p className="text-[12px] text-cream/60">Keep this link private: anyone with it could read the receipts. If it gets out, make a new one.</p>
    </div>
  );
}

const STEPS = [
  "Plug the printer into the router with a network cable and switch it on. It prints a sheet with its IP address (if not, hold the small button on the back for 3 seconds).",
  "On the till, open https://<that IP address> in Chrome and go past the security warning. Sign in as epson; the password is the serial number on the label underneath.",
  `Open Server Direct Print. Set it to Enable, paste the link above as the URL of Server 1, set the interval to ${POLL_SECONDS} seconds and leave the ID and password empty. Save; the printer restarts.`,
  "Tap Print a test slip below. If nothing comes out within a minute, open Root Certificate Update in the same printer settings, run it, and try again.",
];

function Setup({ now }) {
  const health = printerHealth(usePrinter(), now);
  const [message, setMessage] = useState("");
  const test = async () => {
    try {
      await getRepo().printTestReceipt();
      setMessage(`Test slip sent. It prints the next time the printer checks in (every ${POLL_SECONDS} s).`);
    } catch (err) {
      setMessage(err.message);
    }
  };
  const isReady = health.state === "ready";
  return (
    <div className="mt-4 grid gap-4">
      <p role="status" className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-[13.5px] font-semibold ${isReady ? "bg-go/25 text-[#cdf3c4]" : "bg-flex/25 text-flame-light"}`}>
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${isReady ? "bg-[#8fdc7f]" : "bg-flame-light"}`} aria-hidden="true" />
        {health.state === "offline" ? `${STATE_TEXT.offline} ${formatTime(health.lastSeenAt)}.` : STATE_TEXT[health.state]}
      </p>
      <div>
        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-cream/70">Printer link</h3>
        <PrinterLink />
      </div>
      <div>
        <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-cream/70">Set up the printer (once)</h3>
        <ol className="grid list-decimal gap-1.5 pl-5 text-[13px] text-cream/85">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={test} className="press h-11 rounded-xl bg-flex px-5 text-[13.5px] font-bold text-white">
          Print a test slip
        </button>
        {message && <p role="status" className="text-[12.5px] text-cream/75">{message}</p>}
      </div>
    </div>
  );
}

/** Admin → Shop: how the kitchen's ticket prints when an order is accepted. */
export default function ReceiptPrinter({ settings, now, onSave }) {
  // The choice shows at once; the saved setting wins when it arrives, here
  // or from another screen.
  const [chosen, setChosen] = useState(settings.receiptPrinter);
  const [saved, setSaved] = useState(settings.receiptPrinter);
  if (settings.receiptPrinter !== saved) {
    setSaved(settings.receiptPrinter);
    setChosen(settings.receiptPrinter);
  }
  const choose = (id) => {
    setChosen(id);
    onSave({ receiptPrinter: id }).catch((err) => {
      setChosen(saved);
      window.alert(err.message);
    });
  };
  return (
    <div>
      <fieldset className="grid gap-2.5 sm:grid-cols-2">
        <legend className="sr-only">How receipts print</legend>
        {CHOICES.map((c) => {
          const isDisabled = c.id === "network" && !IS_CLOUD;
          return (
            <label
              key={c.id}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl bg-cream/5 px-4 py-3 ring-1 has-[:checked]:bg-cream/12 has-[:checked]:ring-2 has-[:checked]:ring-flame-light has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cream ${
                isDisabled ? "cursor-not-allowed opacity-50" : ""
              } ring-cream/10`}
            >
              <input
                type="radio"
                name="receiptPrinter"
                value={c.id}
                checked={chosen === c.id}
                disabled={isDisabled}
                onChange={() => choose(c.id)}
                className="mt-1 size-4 accent-flex"
              />
              <span>
                <span className="block text-[14px] font-semibold">{c.label}</span>
                <span className="block text-[12px] text-cream/60">{isDisabled ? "Works on the live website only." : c.hint}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {IS_CLOUD && chosen === "network" && <Setup now={now} />}
    </div>
  );
}
