"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { DAYS, readSchedule } from "../../lib/hours";

const field =
  "h-11 w-full min-w-0 rounded-xl bg-cream/8 px-2 text-[14.5px] text-cream ring-1 ring-cream/45 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-flame-light max-[419px]:[&::-webkit-calendar-picker-indicator]:hidden";
const DEFAULT_DAY = { isOpen: true, opens: "12:00", closes: "23:00" };

const toDraft = (schedule) =>
  Object.fromEntries(DAYS.map((day) => [day, schedule[day] ? { isOpen: true, opens: schedule[day][0], closes: schedule[day][1] } : { ...DEFAULT_DAY, isOpen: false }]));

function fromDraft(draft) {
  const schedule = Object.fromEntries(DAYS.map((day) => [day, draft[day].isOpen ? [draft[day].opens, draft[day].closes] : null]));
  const bad = DAYS.find((day) => draft[day].isOpen && (!draft[day].opens || !draft[day].closes || draft[day].opens === draft[day].closes));
  if (bad) throw new Error(`${bad[0].toUpperCase()}${bad.slice(1)}: enter an opening and a closing time that are different.`);
  const clean = readSchedule(schedule);
  if (!clean) throw new Error("Those times are not valid. Use the hour and minute boxes.");
  return clean;
}

/**
 * The shop's opening hours, a day at a time. They drive the "Open now" pill,
 * the footer, and whether checkout takes orders. A closing time earlier than
 * the opening time means the shop closes after midnight.
 */
export default function OpeningHoursEditor({ hours, onSave }) {
  const [draft, setDraft] = useState(() => toDraft(hours));
  const [saved, setSaved] = useState(hours);
  const [message, setMessage] = useState(null); // { tone: "ok" | "error", text }
  // Another screen saved different hours: show them.
  if (JSON.stringify(hours) !== JSON.stringify(saved)) {
    setSaved(hours);
    setDraft(toDraft(hours));
  }

  const change = (day, patch) => {
    setDraft((d) => ({ ...d, [day]: { ...d[day], ...patch } }));
    setMessage(null);
  };
  const copyMonday = () => {
    setDraft((d) => Object.fromEntries(DAYS.map((day) => [day, { ...d.monday }])));
    setMessage(null);
  };
  const save = async (event) => {
    event.preventDefault();
    try {
      await onSave(fromDraft(draft));
      setMessage({ tone: "ok", text: "Opening hours saved. The website shows them now." });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    }
  };

  return (
    <form onSubmit={save} className="grid gap-3">
      <ul className="grid gap-1.5">
        {DAYS.map((day) => {
          const d = draft[day];
          const isLate = d.isOpen && d.opens && d.closes && d.closes < d.opens;
          return (
            <li key={day} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-2xl bg-cream/5 px-3 py-2 ring-1 ring-cream/10 sm:grid-cols-[7rem_7.5rem_minmax(0,1fr)]">
              <span className="text-[14px] font-semibold capitalize">{day}</span>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-cream/80">
                <input type="checkbox" role="switch" checked={d.isOpen} onChange={(e) => change(day, { isOpen: e.target.checked })} className="peer sr-only" />
                <span
                  aria-hidden="true"
                  className="relative h-6 w-10 shrink-0 rounded-full bg-cream/20 transition-colors peer-checked:bg-go peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-cream after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
                />
                {d.isOpen ? "Open" : "Closed"}
                <span className="sr-only"> on {day}</span>
              </label>
              {d.isOpen ? (
                <span className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:col-span-1 sm:max-w-[20rem]">
                  <input type="time" value={d.opens} onChange={(e) => change(day, { opens: e.target.value })} aria-label={`${day} opens`} className={field} />
                  <span className="text-cream/60" aria-hidden="true">
                    to
                  </span>
                  <input type="time" value={d.closes} onChange={(e) => change(day, { closes: e.target.value })} aria-label={`${day} closes`} className={field} />
                  {isLate && <span className="col-span-3 text-[12px] font-semibold text-flame-light">Closes past midnight</span>}
                </span>
              ) : (
                <span className="col-span-2 text-[12.5px] text-cream/55 sm:col-span-1">No orders all day</span>
              )}
            </li>
          );
        })}
      </ul>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-[13px] font-semibold ${message.tone === "error" ? "text-flame-light" : "text-[#8fdc7f]"}`}>
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="press h-11 rounded-xl bg-cream px-4 text-[14px] font-semibold text-roast-900">
          Save opening hours
        </button>
        <button type="button" onClick={copyMonday} className="press flex h-11 items-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold ring-1 ring-cream/15 hover:bg-cream/5">
          <Copy className="size-4" aria-hidden="true" />
          Copy Monday to every day
        </button>
      </div>
    </form>
  );
}
