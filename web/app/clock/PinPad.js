"use client";
import { useEffect } from "react";
import { Delete } from "lucide-react";

export const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A big on-screen keypad for a shop tablet, plus the hardware keyboard.
 * Calls onComplete once all `length` digits are in. A PIN shows as dots;
 * a Staff ID (`isMasked` false) shows its digits so a typo can be seen.
 */
export default function PinPad({ value, onChange, onComplete, isDisabled, length = PIN_LENGTH, isMasked = true, label = "PIN keypad" }) {
  const press = (digit) => {
    if (isDisabled || value.length >= length) return;
    const next = value + digit;
    onChange(next);
    if (next.length === length) onComplete(next);
  };
  const back = () => !isDisabled && onChange(value.slice(0, -1));

  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === "Backspace") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const key =
    "press flex h-16 items-center justify-center rounded-2xl bg-cream/8 font-display text-[26px] font-bold text-cream ring-1 ring-cream/10 hover:bg-cream/15 disabled:opacity-40";

  return (
    <div className="grid gap-5">
      {isMasked ? (
        <div className="flex justify-center gap-4" aria-hidden="true">
          {Array.from({ length }, (_, i) => (
            <span
              key={i}
              className={`size-4 rounded-full transition-colors ${i < value.length ? "bg-flame-light" : "bg-cream/15 ring-1 ring-cream/25"}`}
            />
          ))}
        </div>
      ) : (
        <div className="flex justify-center gap-2.5" aria-hidden="true">
          {Array.from({ length }, (_, i) => (
            <span
              key={i}
              className={`flex h-14 w-12 items-center justify-center rounded-xl font-display text-[28px] font-black tabular-nums ${
                i < value.length ? "bg-cream text-roast-900" : i === value.length ? "bg-cream/8 ring-2 ring-flame-light" : "bg-cream/8 ring-1 ring-cream/20"
              }`}
            >
              {value[i] ?? ""}
            </span>
          ))}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {isMasked ? `${value.length} of ${length} digits entered` : value ? `Typed ${value.split("").join(" ")}` : `Type ${length} digits`}
      </p>
      <div role="group" aria-label={label} className="grid grid-cols-3 gap-2.5">
        {KEYS.map((digit) => (
          <button key={digit} type="button" className={key} disabled={isDisabled} onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <button
          type="button"
          className={`${key} text-[14px] font-semibold`}
          disabled={isDisabled || !value}
          onClick={() => onChange("")}
        >
          Clear
        </button>
        <button type="button" className={key} disabled={isDisabled} onClick={() => press("0")}>
          0
        </button>
        <button type="button" className={key} disabled={isDisabled || !value} onClick={back} aria-label="Delete last digit">
          <Delete className="size-6" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
