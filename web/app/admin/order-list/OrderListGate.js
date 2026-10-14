"use client";
import { useEffect, useState } from "react";
import { ClipboardList, Lock } from "lucide-react";
import { staffAuth } from "../../lib/store/staffAuth";
import OrderListStudio from "./OrderListStudio";

const digits = (value) => value.replace(/\D/g, "").slice(0, 8);
// React runs effects twice in development; a lock queued for the next tick is
// called off if the list opens again at once.
let pendingLock = null;

/**
 * The order list has its own PIN, on top of the admin's sign-in, asked for on
 * every visit. Leaving the page locks it again.
 */
export default function OrderListGate() {
  const [isOpen, setIsOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  // Locked again when the page closes, so the next visit asks for the PIN.
  useEffect(() => {
    if (!isOpen) return undefined;
    clearTimeout(pendingLock);
    return () => {
      pendingLock = setTimeout(() => staffAuth.lockList(), 0);
    };
  }, [isOpen]);

  if (isOpen) {
    return (
      <OrderListStudio
        onLock={() => {
          setPin("");
          setIsOpen(false);
        }}
      />
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    if (isBusy) return;
    if (pin.length < 4) return setError("Enter the 4 to 8 digit PIN.");
    setIsBusy(true);
    try {
      await staffAuth.unlockList(pin);
      setError(null);
      setIsOpen(true);
    } catch (err) {
      setError(err.message);
      setPin("");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <form onSubmit={submit} aria-labelledby="list-lock-heading" className="mx-auto mt-4 grid w-full max-w-[380px] gap-4 rounded-[22px] bg-roast-900 p-5 ring-1 ring-cream/10">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-flame-light text-roast-950">
        <ClipboardList className="size-6" aria-hidden="true" />
      </span>
      <div>
        <h1 id="list-lock-heading" className="font-display text-[24px] font-black uppercase leading-none">
          Order list
        </h1>
        <p className="mt-1.5 text-[13.5px] text-cream/70">Enter the order list PIN to make or download a list.</p>
      </div>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        Order list PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => setPin(digits(e.target.value))}
          className="h-14 rounded-2xl bg-cream/10 px-4 text-center font-display text-[24px] tracking-[0.5em] ring-1 ring-cream/45 focus:outline-none focus:ring-2 focus:ring-flame-light"
        />
      </label>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-flame-light">
          {error}
        </p>
      )}
      <button type="submit" disabled={isBusy} className="press flex h-13 items-center justify-center gap-2 rounded-2xl bg-flex py-3.5 text-[15px] font-semibold text-white hover:bg-flex-deep disabled:opacity-60">
        <Lock className="size-4" aria-hidden="true" />
        {isBusy ? "Checking…" : "Open order list"}
      </button>
      <p className="text-[12px] leading-snug text-cream/55">Forgot it? The owner can set a new one in Staff &amp; hours → Shift codes.</p>
    </form>
  );
}
