"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { staffAuth } from "../../lib/store/staffAuth";
import { field } from "../staff/StaffRow";

const EMPTY = { current: "", next: "", repeat: "" };
const digits = (value) => value.replace(/\D/g, "").slice(0, 8);

/** Change the order list PIN like a password: the current PIN, then the new one twice. */
export default function ChangeListPin() {
  const [draft, setDraft] = useState(EMPTY);
  const [note, setNote] = useState(null); // { tone, text }
  const [isSaving, setIsSaving] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    if (isSaving) return;
    if (!draft.current) return setNote({ tone: "error", text: "Enter the current PIN." });
    if (draft.next.length < 4) return setNote({ tone: "error", text: "Use 4 to 8 digits for the new PIN." });
    if (draft.next !== draft.repeat) return setNote({ tone: "error", text: "The new PIN and its confirmation do not match." });
    if (draft.next === draft.current) return setNote({ tone: "error", text: "The new PIN is the same as the current one." });
    setIsSaving(true);
    try {
      await staffAuth.changeCode("list", draft.current, draft.next);
      setDraft(EMPTY);
      setNote({ tone: "ok", text: "PIN changed. Use the new PIN next time." });
    } catch (err) {
      setNote({ tone: "error", text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const input = (key, label, autoComplete) => (
    <label className="grid gap-1.5 text-[13px] font-semibold">
      {label}
      <input
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        value={draft[key]}
        onChange={(e) => set({ [key]: digits(e.target.value) })}
        className={`${field} tracking-[0.3em]`}
      />
    </label>
  );

  return (
    <details className="group rounded-[22px] bg-roast-900 ring-1 ring-cream/10">
      <summary className="press flex cursor-pointer list-none items-center gap-2 rounded-[22px] p-4 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
        <KeyRound className="size-4" aria-hidden="true" />
        Change order list PIN
        <span aria-hidden="true" className="ml-auto text-cream/50 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <form onSubmit={submit} className="grid gap-4 border-t border-cream/10 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {input("current", "Current PIN", "current-password")}
          {input("next", "New PIN (4 to 8 digits)", "new-password")}
          {input("repeat", "Confirm new PIN", "new-password")}
        </div>
        <button type="submit" disabled={isSaving} className="press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-flex px-4 text-[14px] font-semibold text-white hover:bg-flex-deep disabled:opacity-60 sm:justify-self-start">
          <KeyRound className="size-4" aria-hidden="true" />
          {isSaving ? "Changing…" : "Change PIN"}
        </button>
        {note && (
          <p role={note.tone === "error" ? "alert" : "status"} className={`text-[13px] font-semibold ${note.tone === "error" ? "text-flame-light" : "text-gold"}`}>
            {note.text}
          </p>
        )}
      </form>
    </details>
  );
}
