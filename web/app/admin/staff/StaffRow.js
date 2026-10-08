"use client";
import { useState } from "react";
import { LogOut, Pencil, Trash2 } from "lucide-react";
import { STAFF_ID_LENGTH, STAFF_ROLES, formatDuration, shiftMinutes } from "../../lib/timeclock";

export const field =
  "h-11 w-full rounded-xl bg-cream/8 px-3.5 text-[15px] text-cream ring-1 ring-cream/45 focus:outline-none focus:ring-2 focus:ring-flame-light";

const timeOf = (at) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(at);

const digits = (value, length) => value.replace(/\D/g, "").slice(0, length);

/** Name, role, Staff ID and PIN inputs, shared by "Add staff" and "Edit". */
export function StaffFields({ draft, setDraft, isNew }) {
  return (
    <>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        Name
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoComplete="off" maxLength={40} className={field} />
      </label>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        Role
        <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className={field}>
          {Object.entries(STAFF_ROLES).map(([value, label]) => (
            <option key={value} value={value} className="bg-roast-900">
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        Staff ID ({STAFF_ID_LENGTH} digits)
        <input
          value={draft.code}
          onChange={(e) => setDraft({ ...draft, code: digits(e.target.value, STAFF_ID_LENGTH) })}
          inputMode="numeric"
          autoComplete="off"
          className={`${field} font-display font-bold tracking-[0.2em]`}
        />
      </label>
      <label className="grid gap-1.5 text-[13px] font-semibold">
        {isNew ? "Clock PIN (4 digits)" : "New PIN (leave empty to keep)"}
        <input
          value={draft.pin}
          onChange={(e) => setDraft({ ...draft, pin: digits(e.target.value, 4) })}
          inputMode="numeric"
          autoComplete="off"
          className={`${field} tracking-[0.3em]`}
        />
      </label>
    </>
  );
}

export default function StaffRow({ member, shift, now, onSave, onRemove, onClockOut }) {
  const [draft, setDraft] = useState(null); // editing when set
  const [error, setError] = useState(null);

  const save = async (event) => {
    event.preventDefault();
    try {
      await onSave(member.id, draft);
      setDraft(null);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  if (draft) {
    return (
      <li className="rounded-2xl bg-roast-900 p-3.5 ring-1 ring-cream/20">
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" aria-label={`Edit ${member.name}`}>
          <StaffFields draft={draft} setDraft={setDraft} />
          {error && (
            <p role="alert" className="text-[13px] font-semibold text-flame-light sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="press h-10 rounded-xl bg-cream px-4 text-[13.5px] font-semibold text-roast-900">
              Save
            </button>
            <button type="button" onClick={() => setDraft(null)} className="press h-10 rounded-xl px-4 text-[13.5px] font-semibold text-cream/75 ring-1 ring-cream/15">
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-roast-900 p-3 ring-1 ring-cream/10">
      <span className={`size-2.5 shrink-0 rounded-full ${shift ? "bg-[#5fd34a]" : "bg-cream/20"}`} aria-hidden="true" />
      <span className="shrink-0 rounded-lg bg-cream/10 px-2 py-1 font-display text-[13px] font-bold tabular-nums tracking-[0.08em]" title="Staff ID">
        <span className="sr-only">Staff ID </span>
        {member.code}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold">{member.name}</span>
        <span className="block text-[12.5px] text-cream/60">
          {STAFF_ROLES[member.role]} ·{" "}
          {shift ? `on shift since ${timeOf(shift.startAt)} (${formatDuration(shiftMinutes(shift, now))})` : "off shift"}
        </span>
      </span>
      {shift && (
        <button
          type="button"
          onClick={() => onClockOut(member)}
          className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-flame-light ring-1 ring-cream/15 hover:bg-cream/5"
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span className="max-sm:sr-only">Clock out</span>
          <span className="sr-only"> {member.name}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setDraft({ name: member.name, role: member.role, code: member.code ?? "", pin: "" })}
        aria-label={`Edit ${member.name}`}
        className="press flex size-10 shrink-0 items-center justify-center rounded-xl text-cream/75 hover:bg-cream/10 hover:text-cream"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onRemove(member)}
        aria-label={`Remove ${member.name}`}
        className="press flex size-10 shrink-0 items-center justify-center rounded-xl text-cream/75 hover:bg-flex/25 hover:text-cream"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}
