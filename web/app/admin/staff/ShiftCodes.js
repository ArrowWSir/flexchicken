"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { staffAuth } from "../../lib/store/staffAuth";
import { field } from "./StaffRow";

const KINDS = [
  { id: "admin", label: "Owner's code", hint: "Opens /admin and sets up the clock tablet." },
  { id: "staff", label: "Staff code", hint: "Opens /staff: orders and cards only." },
  { id: "driver", label: "Driver code", hint: "Opens /driver, for every driver." },
  { id: "list", label: "Order list PIN", hint: "Opens the order list. Starts as 0000." },
];
const EMPTY = { current: "", next: "", repeat: "" };
const digits = (value) => value.replace(/\D/g, "").slice(0, 8);

/**
 * The owner changes a shift code, like a password: the current owner's code,
 * then the new one twice. Every other device using the old code is signed out.
 */
export default function ShiftCodes() {
  const [kind, setKind] = useState("admin");
  const [draft, setDraft] = useState(EMPTY);
  const [note, setNote] = useState(null); // { tone, text }
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    if (isSaving) return;
    if (draft.next.length < 4) return setNote({ tone: "error", text: "Use 4 to 8 digits for the new code." });
    if (draft.next !== draft.repeat) return setNote({ tone: "error", text: "The two new codes do not match." });
    setIsSaving(true);
    try {
      await staffAuth.changeCode(kind, draft.current, draft.next);
      setDraft(EMPTY);
      setNote({
        tone: "ok",
        text: {
          admin: "Owner's code changed. Other admin screens and the clock tablet need the new code.",
          staff: "Staff code changed. Staff open /staff with the new code.",
          driver: "Driver code changed. Drivers sign in again with the new code.",
          list: "Order list PIN changed. Use the new PIN to open the order list.",
        }[kind],
      });
    } catch (err) {
      setNote({ tone: "error", text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section aria-labelledby="codes-heading" className="grid grid-cols-1 gap-3">
      <h2 id="codes-heading" className="font-display text-[18px] font-black uppercase">
        Shift codes
      </h2>
      <form onSubmit={submit} className="grid gap-4 rounded-[22px] bg-roast-900 p-4 ring-1 ring-cream/10 sm:p-5">
        <fieldset className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <legend className="mb-2 text-[13px] font-semibold">Which code</legend>
          {KINDS.map((k) => (
            <label
              key={k.id}
              className={`press flex cursor-pointer flex-col gap-0.5 rounded-xl p-3 ring-1 ${kind === k.id ? "bg-flex/20 ring-flame-light" : "ring-cream/15 hover:bg-cream/5"}`}
            >
              <input type="radio" name="code-kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} className="sr-only" />
              <span className="text-[14.5px] font-semibold">{k.label}</span>
              <span className="text-[12.5px] text-cream/65">{k.hint}</span>
            </label>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1.5 text-[13px] font-semibold">
            {kind === "list" ? "Current PIN or your owner's code" : "Your current owner's code"}
            <input type="password" inputMode="numeric" autoComplete="current-password" value={draft.current} onChange={(e) => set({ current: digits(e.target.value) })} className={`${field} tracking-[0.3em]`} />
          </label>
          <label className="grid gap-1.5 text-[13px] font-semibold">
            New code (4 to 8 digits)
            <input type="password" inputMode="numeric" autoComplete="new-password" value={draft.next} onChange={(e) => set({ next: digits(e.target.value) })} className={`${field} tracking-[0.3em]`} />
          </label>
          <label className="grid gap-1.5 text-[13px] font-semibold">
            New code again
            <input type="password" inputMode="numeric" autoComplete="new-password" value={draft.repeat} onChange={(e) => set({ repeat: digits(e.target.value) })} className={`${field} tracking-[0.3em]`} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isSaving} className="press flex h-11 items-center gap-1.5 rounded-xl bg-flex px-4 text-[14px] font-semibold text-white hover:bg-flex-deep disabled:opacity-60">
            <KeyRound className="size-4" aria-hidden="true" />
            {isSaving ? "Changing…" : "Change code"}
          </button>
          <p className="text-[12.5px] text-cream/60">Longer codes are safer. Every other device using the old code is signed out.</p>
        </div>
        {note && (
          <p role={note.tone === "error" ? "alert" : "status"} className={`text-[13px] font-semibold ${note.tone === "error" ? "text-flame-light" : "text-gold"}`}>
            {note.text}
          </p>
        )}
      </form>
    </section>
  );
}
