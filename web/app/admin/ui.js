"use client";
import { useState } from "react";
import { toPence } from "../lib/cart";

// Pieces every admin screen shares, so a switch or a money box looks and
// behaves the same in Menu, Offers and Shop.

export const FIELD =
  "h-11 w-full rounded-xl bg-cream/8 px-3.5 text-[15px] text-cream ring-1 ring-cream/45 placeholder:text-cream/40 focus:outline-none focus:ring-2 focus:ring-flame-light";


export function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-cream/5 px-4 py-3 ring-1 ring-cream/10">
      <span>
        <span className="block text-[14px] font-semibold">{label}</span>
        {hint && <span className="block text-[12px] text-cream/60">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full bg-cream/20 transition-colors peer-checked:bg-go peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-cream after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

export function NumberSetting({ label, suffix, value, onCommit, step = 1, isMoney = false }) {
  const shown = isMoney ? (value / 100).toFixed(2) : String(value);
  const [text, setText] = useState(shown);
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    setText(shown);
  }
  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n) || n < 0) {
      setText(shown);
      return;
    }
    onCommit(isMoney ? toPence(n) : n);
  };
  return (
    <label className="grid min-w-0 gap-1.5 text-[13px] font-semibold">
      {label}
      <span className="flex min-w-0 items-center gap-2">
        {isMoney && <span className="text-cream/60">£</span>}
        <input
          type="number"
          min="0"
          step={step}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={`${FIELD} min-w-0`}
        />
        {suffix && <span className="shrink-0 text-[12.5px] font-normal text-cream/60">{suffix}</span>}
      </span>
    </label>
  );
}
