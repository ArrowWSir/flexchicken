"use client";
import { useState, useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";
import { getRepo } from "../../lib/store";
import { formatTime } from "../../lib/receipt";
import { printerHealth } from "../../lib/receiptPrinter";
import { setThisTill, subscribeTill, tillReach } from "../../lib/tillPrinter";
import { usePrinter } from "../../hooks/usePrinter";
import { useIsThisTill } from "../../hooks/useTillPrinterRelay";

// Long enough to read "Saved" before the page reloads with the new address
// allowed (worker.js puts it in the staff pages' CSP).
const RELOAD_AFTER_MS = 1200;
const NO_REACH = { state: "unknown", at: null };

const STEPS = [
  "Plug the printer into the router with a network cable and switch it on. Hold the small button on the back for 3 seconds: it prints a sheet with its IP address.",
  "In the router's settings, reserve that IP address for the printer (DHCP reservation), so it never changes.",
  "On the till, open https://<that IP address> in Chrome. Tap Advanced, then Proceed. Sign in as epson; the password is the serial number on the label underneath.",
  "Open Configuration → ePOS-Print. Check ePOS-Print is Enable and Device ID is local_printer, then tap Send.",
  "Type the IP address below and tap Save. This page reloads.",
  "On the till, turn on \"This screen is the till\". If Chrome asks to let the site find devices on your local network, tap Allow.",
  "Tap Print a test slip. From then on, keep /staff open on the till with the screen awake: receipts print only while it is open.",
];

const STATE_TEXT = {
  ready: "Connected: the till reached the printer just now.",
  offline: "Offline: the till has not reached the printer since",
  never: "Waiting: the till has not reached the printer yet. Follow the steps below.",
};

function AddressForm({ saved }) {
  const [value, setValue] = useState(saved ?? "");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await getRepo().setPrinterAddress(value);
      setIsError(false);
      setMessage("Saved. Reloading so this screen can reach the printer…");
      setTimeout(() => window.location.reload(), RELOAD_AFTER_MS);
    } catch (err) {
      setIsError(true);
      setMessage(err.message);
    }
  };
  return (
    <form onSubmit={save} className="grid gap-2">
      <label htmlFor="printer-address" className="text-[13px] font-bold uppercase tracking-[0.08em] text-cream/70">
        Printer IP address
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="printer-address"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="192.168.1.172"
          className="h-11 min-w-0 flex-1 rounded-xl bg-black/30 px-3 font-mono text-[15px] text-cream ring-1 ring-cream/15 placeholder:text-cream/35 focus:outline-none focus:ring-2 focus:ring-flame-light"
        />
        <button type="submit" className="press h-11 rounded-xl bg-cream px-5 text-[13.5px] font-bold text-roast-900">
          Save
        </button>
      </div>
      {message && (
        <p role={isError ? "alert" : "status"} className={`text-[12.5px] ${isError ? "text-flame-light" : "text-cream/75"}`}>
          {message}
        </p>
      )}
    </form>
  );
}

function ThisTill({ address }) {
  const isTill = useIsThisTill();
  const reach = useSyncExternalStore(subscribeTill, tillReach, () => NO_REACH);
  const [error, setError] = useState("");
  const toggle = (e) => {
    setError("");
    try {
      setThisTill(e.target.checked);
    } catch {
      setError("This browser keeps nothing (private window?). Open the site in a normal Chrome window on the till.");
    }
  };
  return (
    <div className="grid gap-2">
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-cream/5 px-4 py-3 ring-1 ring-cream/10 has-[:checked]:bg-cream/12 has-[:checked]:ring-2 has-[:checked]:ring-flame-light has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cream">
        <input type="checkbox" checked={isTill} onChange={toggle} className="mt-1 size-4 accent-flex" />
        <span>
          <span className="block text-[14px] font-semibold">This screen is the till</span>
          <span className="block text-[12px] text-cream/60">Turn on only on the till by the printer. It sends receipts while a staff screen is open on it.</span>
        </span>
      </label>
      {error && <p role="alert" className="text-[12.5px] text-flame-light">{error}</p>}
      {isTill && reach.state === "unreachable" && address && (
        <div role="alert" className="grid gap-2 rounded-2xl bg-flex/20 px-4 py-3 text-[13px] ring-1 ring-flex/50">
          <p className="font-bold text-flame-light">This till cannot reach the printer at {address}.</p>
          <p className="text-cream/80">
            Check the printer is on and plugged into the router. If it is, open its page, tap Advanced, then Proceed, and come back: Chrome has to be told once that the printer is safe.
          </p>
          <a
            href={`https://${address}`}
            target="_blank"
            rel="noreferrer"
            className="press flex h-10 w-fit items-center gap-2 rounded-xl bg-cream px-4 text-[13px] font-bold text-roast-900"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Open the printer's page
          </a>
        </div>
      )}
    </div>
  );
}

/** Admin → Shop → Receipt printer, "sent by the till": the printer's address and this screen's part. */
export default function TillPrinterSetup({ now }) {
  const printer = usePrinter();
  const health = printerHealth(printer, now);
  const [message, setMessage] = useState("");
  const test = async () => {
    try {
      await getRepo().printTestReceipt();
      setMessage("Test slip sent. It prints within a few seconds while a staff screen is open on the till.");
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
      <AddressForm key={printer.address ?? ""} saved={printer.address} />
      <ThisTill address={printer.address} />
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
