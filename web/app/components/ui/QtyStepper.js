"use client";
import { Minus, Plus } from "lucide-react";
import NumberFlow from "@number-flow/react";
import { MAX_QTY } from "../../lib/cart";

// − 1 + : how many portions. `tone` matches the surface it sits on.
export default function QtyStepper({ value, onChange, label, min = 1, tone = "light", size = "md" }) {
  const isDark = tone === "dark";
  const button = `press flex items-center justify-center rounded-full disabled:opacity-35 ${
    size === "sm" ? "size-7" : "size-10"
  } ${isDark ? "bg-cream/10 text-cream hover:bg-cream/20" : "bg-surface text-ink hover:bg-line"}`;
  return (
    <div
      role="group"
      aria-label={`${label} quantity`}
      className={`inline-flex items-center gap-1 rounded-full p-1 ${isDark ? "bg-roast-950/40" : "bg-ground-raised ring-1 ring-field"}`}
    >
      <button type="button" className={button} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="One fewer">
        <Minus className="size-4" strokeWidth={2.4} aria-hidden="true" />
      </button>
      <span className={`${size === "sm" ? "min-w-5 text-[14px]" : "min-w-7 text-[16px]"} text-center font-display font-bold tabular-nums ${isDark ? "text-cream" : "text-ink"}`}>
        <NumberFlow value={value} />
        <span className="sr-only"> portions</span>
      </span>
      <button type="button" className={button} onClick={() => onChange(value + 1)} disabled={value >= MAX_QTY} aria-label="One more">
        <Plus className="size-4" strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}
