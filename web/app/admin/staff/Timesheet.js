"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, TriangleAlert } from "lucide-react";
import ShiftFix from "./ShiftFix";
import { STAFF_ROLES, formatDuration, isLongShift, shiftMinutes, timesheet, timesheetCsv, weekEnd, weekStart } from "../../lib/timeclock";

const dayTime = (at) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(at);
const timeOf = (at) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(at);
const weekLabel = (start) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(start);
const isoDay = (at) => new Date(at).toLocaleDateString("en-CA"); // 2026-10-05

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

function shiftLine(shift) {
  const end = shift.endAt === null ? "now" : timeOf(shift.endAt);
  return `${dayTime(shift.startAt)} – ${end}`;
}

/** Hours worked, a week at a time (Monday to Sunday), with a CSV for payroll. */
export default function Timesheet({ staff, shifts, now }) {
  const [start, setStart] = useState(() => weekStart(now));
  const [fixingId, setFixingId] = useState(null);
  const end = weekEnd(start);
  const rows = timesheet(staff, shifts, start, end, now);
  const total = rows.reduce((sum, row) => sum + row.minutes, 0);
  const hasShifts = rows.some((row) => row.shifts.length > 0);
  const isThisWeek = start === weekStart(now);
  const step = (weeks) => {
    const date = new Date(start);
    date.setDate(date.getDate() + 7 * weeks);
    setStart(weekStart(date.getTime()));
  };

  return (
    <section aria-labelledby="hours-heading" className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="hours-heading" className="font-display text-[18px] font-black uppercase">
          Hours
        </h2>
        <button
          type="button"
          onClick={() => download(`flex-chicken-hours-${isoDay(start)}.csv`, timesheetCsv(rows, now))}
          disabled={!hasShifts}
          className="press flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-semibold ring-1 ring-cream/15 hover:bg-cream/5 disabled:opacity-40"
        >
          <Download className="size-4" aria-hidden="true" />
          Download CSV
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-2xl bg-roast-900 p-1.5 ring-1 ring-cream/10">
        <button type="button" onClick={() => step(-1)} aria-label="Previous week" className="press flex size-10 items-center justify-center rounded-xl hover:bg-cream/10">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <p className="flex-1 text-center text-[14px] font-semibold" aria-live="polite">
          {isThisWeek ? "This week" : `Week of ${weekLabel(start)}`}
          <span className="block text-[12px] font-normal text-cream/60">
            {weekLabel(start)} – {weekLabel(end - 1)} · {formatDuration(total)} in total
          </span>
        </p>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={isThisWeek}
          aria-label="Next week"
          className="press flex size-10 items-center justify-center rounded-xl hover:bg-cream/10 disabled:opacity-30"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-roast-900 px-4 py-5 text-center text-[13.5px] text-cream/60 ring-1 ring-cream/10">No staff yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {rows.map((row) => (
            <li key={row.staffId} className="rounded-2xl bg-roast-900 p-3.5 ring-1 ring-cream/10">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0">
                  <span className="block truncate text-[14.5px] font-semibold">
                    {row.name}
                    {!row.isActive && <span className="font-normal text-cream/50"> (left)</span>}
                  </span>
                  <span className="block text-[12px] text-cream/60">
                    {STAFF_ROLES[row.role]} · {row.shifts.length} shift{row.shifts.length === 1 ? "" : "s"}
                  </span>
                </p>
                <p className="shrink-0 font-display text-[20px] font-black tabular-nums">{formatDuration(row.minutes)}</p>
              </div>
              {row.shifts.length > 0 && (
                <ul className="mt-2.5 grid gap-1 border-t border-cream/10 pt-2.5 text-[12.5px]">
                  {row.shifts.map((shift) =>
                    fixingId === shift.id ? (
                      <li key={shift.id}>
                        <ShiftFix shift={shift} name={row.name} now={now} onDone={() => setFixingId(null)} />
                      </li>
                    ) : (
                      <li key={shift.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 text-cream/75">
                          {shiftLine(shift)}
                          {shift.isCorrected ? (
                            <span className="text-cream/50"> · corrected</span>
                          ) : (
                            shift.closedBy === "manager" && <span className="text-cream/50"> · closed by manager</span>
                          )}
                        </span>
                        <span className={`flex shrink-0 items-center gap-1 tabular-nums ${isLongShift(shift, now) ? "font-semibold text-flame-light" : ""}`}>
                          {isLongShift(shift, now) && (
                            <>
                              <TriangleAlert className="size-3.5" aria-hidden="true" />
                              <span className="sr-only">Forgot to clock out? </span>
                            </>
                          )}
                          {formatDuration(shiftMinutes(shift, now))}
                          <button
                            type="button"
                            onClick={() => setFixingId(shift.id)}
                            className="press -my-1 ml-1 flex size-8 items-center justify-center rounded-lg text-cream/60 hover:bg-cream/10 hover:text-cream"
                            aria-label={`Correct ${row.name}'s shift, ${shiftLine(shift)}`}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </button>
                        </span>
                      </li>
                    )
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
