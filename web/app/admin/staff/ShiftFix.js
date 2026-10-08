"use client";
import { useState } from "react";
import { getRepo } from "../../lib/store";

const field =
  "h-11 w-full min-w-0 rounded-xl bg-cream/8 px-2.5 text-[14px] text-cream ring-1 ring-cream/45 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-flame-light";

// <input type="datetime-local"> speaks device-local "2026-10-05T09:00".
const pad = (n) => String(n).padStart(2, "0");
function toLocalInput(at) {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (text) => (text ? new Date(text).getTime() : NaN);

/**
 * Set a shift's real clock-in and clock-out, for when someone forgot to clock
 * out (or in). An open shift starts with "now" as its clock-out.
 */
export default function ShiftFix({ shift, name, now, onDone }) {
  const [startText, setStartText] = useState(() => toLocalInput(shift.startAt));
  const [endText, setEndText] = useState(() => toLocalInput(shift.endAt ?? now));
  const [error, setError] = useState(null);

  const save = async (event) => {
    event.preventDefault();
    try {
      await getRepo().correctShift(shift.id, { startAt: fromLocalInput(startText), endAt: fromLocalInput(endText) });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={save} aria-label={`Correct ${name}'s shift`} className="grid gap-2 rounded-xl bg-cream/5 p-2.5 ring-1 ring-cream/15">
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        <label className="grid gap-1 text-[12px] font-semibold">
          Clock in
          <input type="datetime-local" value={startText} onChange={(e) => setStartText(e.target.value)} className={field} />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold">
          Clock out
          <input type="datetime-local" value={endText} onChange={(e) => setEndText(e.target.value)} className={field} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] font-semibold text-flame-light">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="press h-10 rounded-xl bg-cream px-3.5 text-[13px] font-semibold text-roast-900">
          Save times
        </button>
        <button type="button" onClick={onDone} className="press h-10 rounded-xl px-3.5 text-[13px] font-semibold ring-1 ring-cream/15 hover:bg-cream/5">
          Cancel
        </button>
      </div>
    </form>
  );
}
