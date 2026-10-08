"use client";
import { useState } from "react";
import { ExternalLink, UserPlus } from "lucide-react";
import { nextStaffId, openShift } from "../../lib/timeclock";
import { getRepo } from "../../lib/store";
import { useShifts, useStaff } from "../../hooks/useShop";
import { useNow } from "../../hooks/useDevice";
import StaffRow, { StaffFields } from "./StaffRow";
import ShiftCodes from "./ShiftCodes";
import Timesheet from "./Timesheet";

const EMPTY_DRAFT = { name: "", role: "kitchen", code: null, pin: "" };

// Each person gets their own Staff ID, suggested as the next free one; the
// owner can type another.
function AddStaff({ staff }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const suggested = (() => {
    try {
      return nextStaffId(staff);
    } catch {
      return "";
    }
  })();
  const shown = { ...draft, code: draft.code === null ? suggested : draft.code };
  // Typing a name or PIN must not freeze the suggested ID: the team list may
  // still be loading, and the next free ID changes when it arrives.
  const update = (next) => setDraft({ ...next, code: draft.code === null && next.code === suggested ? null : next.code });
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await getRepo().addStaff(shown);
      setDraft(EMPTY_DRAFT);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <form onSubmit={submit} aria-labelledby="add-staff-heading" className="grid gap-3 rounded-[22px] bg-roast-900 p-4 ring-1 ring-cream/10 sm:grid-cols-2 sm:items-end sm:p-5 lg:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto]">
      <h3 id="add-staff-heading" className="font-display text-[15px] font-black uppercase sm:col-span-2 lg:col-span-5">
        Add staff
      </h3>
      <StaffFields draft={shown} setDraft={update} isNew />
      <button type="submit" disabled={isSaving} className="press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-flex px-4 text-[14px] font-semibold text-white hover:bg-flex-deep">
        <UserPlus className="size-4" aria-hidden="true" />
        Add
      </button>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-flame-light sm:col-span-2 lg:col-span-5">
          {error}
        </p>
      )}
    </form>
  );
}

/** The owner's side of the staff clock: who is on the team, and their hours. */
export default function StaffManager() {
  const staff = useStaff();
  const shifts = useShifts();
  const now = useNow(30_000);
  const [error, setError] = useState(null);
  const team = staff.filter((s) => s.isActive).sort((a, b) => a.name.localeCompare(b.name));

  const act = async (fn) => {
    try {
      await fn();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[24px] font-black uppercase leading-none">Staff & hours</h1>
        <a
          href="/clock"
          target="_blank"
          rel="noopener"
          className="press flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-semibold ring-1 ring-cream/15 hover:bg-cream/5"
        >
          Open the staff clock
          <ExternalLink className="size-4" aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <p className="-mt-3 max-w-[60ch] text-[13.5px] text-cream/65">
        Only you add staff. Give each person their Staff ID and PIN; they clock in and out with both at{" "}
        <strong className="text-cream">/clock</strong>. Keep it open on the shop tablet.
      </p>

      <section aria-labelledby="team-heading" className="grid grid-cols-1 gap-3">
        <h2 id="team-heading" className="font-display text-[18px] font-black uppercase">
          Team <span className="font-sans text-[13px] font-semibold normal-case text-cream/60">{team.length}</span>
        </h2>
        <AddStaff staff={staff} />
        {error && (
          <p role="alert" className="rounded-xl bg-flex/20 px-4 py-2.5 text-[13px] font-semibold text-flame-light">
            {error}
          </p>
        )}
        {team.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {team.map((member) => (
              <StaffRow
                key={member.id}
                member={member}
                shift={openShift(shifts, member.id)}
                now={now}
                // Rejects on bad input; StaffRow shows the message.
                onSave={(id, draft) => getRepo().updateStaff(id, draft)}
                onRemove={(m) => window.confirm(`Remove ${m.name} from the team? Their past hours stay on the timesheets.`) && act(() => getRepo().removeStaff(m.id))}
                onClockOut={(m) => window.confirm(`Clock ${m.name} out now?`) && act(() => getRepo().clockOut(m.id, "manager"))}
              />
            ))}
          </ul>
        )}
      </section>

      <Timesheet staff={staff} shifts={shifts} now={now} />

      <ShiftCodes />
    </div>
  );
}
