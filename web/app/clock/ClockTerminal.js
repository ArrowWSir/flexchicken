"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";
import { STAFF_ID_LENGTH, STAFF_ROLES, formatDuration, isLongShift, openShift, shiftMinutes } from "../lib/timeclock";
import { getRepo } from "../lib/store";
import { useShifts, useStaff } from "../hooks/useShop";
import { useNow } from "../hooks/useDevice";
import PinPad from "./PinPad";

// The staff clock: a page left open on a tablet by the door. Each person
// types their own Staff ID, then their 4-digit PIN, checks it is them, and
// clocks in or out. Only the owner adds staff and gives out IDs, in
// /admin/staff, where the hours are read too.

const MAX_TRIES = 5;
const LOCK_MS = 30_000;
const CONFIRM_TIMEOUT_MS = 15_000; // walk away mid-way and the pad resets
const DONE_MS = 4_000;

const timeOf = (at) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(at);
const dateOf = (at) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(at);

function OnShift({ staff, shifts, now }) {
  const working = staff
    .filter((s) => s.isActive)
    .map((member) => ({ member, shift: openShift(shifts, member.id) }))
    .filter((row) => row.shift)
    .sort((a, b) => a.shift.startAt - b.shift.startAt);
  return (
    <section aria-labelledby="on-shift-heading" className="rounded-[22px] bg-roast-900 p-4 ring-1 ring-cream/10">
      <h2 id="on-shift-heading" className="flex items-baseline justify-between font-display text-[16px] font-black uppercase">
        On shift now <span className="font-sans text-[13px] font-semibold normal-case text-cream/60">{working.length}</span>
      </h2>
      {working.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-cream/60">Nobody is clocked in.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {working.map(({ member, shift }) => (
            <li key={member.id} className="flex items-center gap-3 rounded-2xl bg-cream/5 px-3.5 py-2.5">
              <span className="size-2.5 shrink-0 rounded-full bg-[#5fd34a]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{member.name}</span>
                <span className="block text-[12.5px] text-cream/60">
                  {STAFF_ROLES[member.role]} · since {timeOf(shift.startAt)}
                </span>
              </span>
              <span className={`shrink-0 font-display text-[15px] font-bold tabular-nums ${isLongShift(shift, now) ? "text-flame-light" : ""}`}>
                {formatDuration(shiftMinutes(shift, now))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Confirm({ found, now, onPunch, onCancel }) {
  const { member, shift } = found;
  const isIn = Boolean(shift);
  return (
    <div className="grid gap-4 text-center">
      <p className="text-[14px] text-cream/70">{STAFF_ROLES[member.role]}</p>
      <p className="-mt-3 font-display text-[34px] font-black uppercase leading-none">Hi {member.name}</p>
      <p className="text-[14.5px] text-cream/80">
        {isIn
          ? `Clocked in since ${timeOf(shift.startAt)} (${formatDuration(shiftMinutes(shift, now))})`
          : "You are not clocked in."}
      </p>
      <button
        type="button"
        onClick={onPunch}
        autoFocus
        className={`press flex h-20 items-center justify-center gap-3 rounded-[22px] font-display text-[24px] font-black uppercase ${
          isIn ? "bg-flex text-white hover:bg-flex-deep" : "bg-go text-white hover:bg-go-deep"
        }`}
      >
        {isIn ? <LogOut className="size-7" aria-hidden="true" /> : <LogIn className="size-7" aria-hidden="true" />}
        {isIn ? "Clock out" : "Clock in"}
      </button>
      <button type="button" onClick={onCancel} className="press h-12 rounded-2xl text-[14.5px] font-semibold text-cream/75 ring-1 ring-cream/15 hover:bg-cream/5">
        Not you? Cancel
      </button>
    </div>
  );
}

function Done({ done }) {
  return (
    <div role="status" className="grid justify-items-center gap-3 py-6 text-center">
      <CheckCircle2 className="size-16 text-[#5fd34a]" strokeWidth={1.8} aria-hidden="true" />
      <p className="font-display text-[28px] font-black uppercase leading-none">
        {done.name} clocked {done.action}
      </p>
      <p className="text-[15px] text-cream/75">
        at {timeOf(done.at)}
        {done.action === "out" ? ` · worked ${formatDuration(done.minutes)}` : ""}
      </p>
    </div>
  );
}

export default function ClockTerminal() {
  const staff = useStaff();
  const shifts = useShifts();
  const now = useNow(1000);
  const [code, setCode] = useState(""); // the Staff ID being typed
  const [typedId, setTypedId] = useState(null); // set once the ID is in: now the PIN
  const [pin, setPin] = useState("");
  const [found, setFound] = useState(null); // { member, shift } once a PIN matches
  const [done, setDone] = useState(null); // { name, action, at, minutes }
  const [error, setError] = useState(null);
  const [tries, setTries] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  // `now` ticks once a second, so it can trail the lock start: cap the countdown.
  const lockSeconds = Math.min(LOCK_MS / 1000, Math.ceil((lockedUntil - now) / 1000));
  const isLocked = lockSeconds > 0;
  const hasTeam = staff.some((s) => s.isActive);

  // Walk away half way and the pad starts over, so the next person does not
  // type their PIN under someone else's ID.
  const startOver = () => {
    setFound(null);
    setTypedId(null);
    setCode("");
    setPin("");
  };

  useEffect(() => {
    if (!found && !typedId) return undefined;
    const timer = setTimeout(startOver, CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [found, typedId]);

  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(() => setDone(null), DONE_MS);
    return () => clearTimeout(timer);
  }, [done]);

  const takeId = (value) => {
    setTypedId(value);
    setCode("");
    setError(null);
  };

  const identify = async (value) => {
    const staffId = typedId;
    setPin("");
    setTypedId(null);
    try {
      setFound(await getRepo().identify(staffId, value));
      setTries(0);
      setError(null);
    } catch (err) {
      const count = tries + 1;
      if (count >= MAX_TRIES) {
        setLockedUntil(Date.now() + LOCK_MS);
        setTries(0);
        setError("Too many wrong tries. The pad is locked for a moment.");
      } else {
        setTries(count);
        setError(err.message);
      }
    }
  };

  const punch = async () => {
    const { member, shift } = found;
    const at = Date.now();
    setFound(null);
    try {
      if (shift) await getRepo().clockOut(member.id);
      else await getRepo().clockIn(member.id);
      setDone({ name: member.name, action: shift ? "out" : "in", at, minutes: shift ? shiftMinutes(shift, at) : 0 });
    } catch (err) {
      setError(`${err.message} Enter your Staff ID and PIN again.`);
    }
  };

  return (
    <div className="on-dark min-h-dvh bg-roast-950 text-cream">
      <header className="border-b border-cream/10 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-3 px-4 sm:px-6">
          <img src="/brand/logo-on-dark.svg" alt="Flex Chicken" width={57} height={32} className="h-9 w-auto shrink-0" />
          <h1 className="min-w-0 flex-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-cream/60">Staff clock</h1>
          {/* Server and browser render a second apart: the clock text may differ. */}
          <p className="text-right leading-tight">
            <span className="block font-display text-[22px] font-black tabular-nums" suppressHydrationWarning>
              {timeOf(now)}
            </span>
            <span className="block text-[11.5px] text-cream/60" suppressHydrationWarning>
              {dateOf(now)}
            </span>
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1100px] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <section aria-label="Clock in or out" className="rounded-[26px] bg-roast-900 p-5 ring-1 ring-cream/10 sm:p-6">
          {!hasTeam ? (
            <p className="py-6 text-center text-[14.5px] leading-relaxed text-cream/75">
              No staff on the list yet. The owner adds the team in <strong className="text-cream">Admin → Staff</strong>.
            </p>
          ) : done ? (
            <Done done={done} />
          ) : found ? (
            <Confirm found={found} now={now} onPunch={punch} onCancel={startOver} />
          ) : typedId ? (
            <div className="grid gap-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[15px] font-semibold">
                  Staff ID <span className="font-display font-black tracking-[0.12em]">{typedId}</span>
                  <span className="block text-[13.5px] font-normal text-cream/70">Now enter your 4-digit PIN</span>
                </p>
                <button type="button" onClick={startOver} className="press h-10 shrink-0 rounded-xl px-3.5 text-[13.5px] font-semibold text-cream/75 ring-1 ring-cream/15 hover:bg-cream/5">
                  Change ID
                </button>
              </div>
              <PinPad value={pin} onChange={setPin} onComplete={identify} isDisabled={isLocked} />
              {(error || isLocked) && (
                <p role="alert" className="text-center text-[13.5px] font-semibold text-flame-light">
                  {isLocked ? `Locked. Try again in ${lockSeconds}s.` : error}
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-5">
              <p className="text-center text-[15px] font-semibold">Enter your Staff ID</p>
              <PinPad value={code} onChange={setCode} onComplete={takeId} isDisabled={isLocked} length={STAFF_ID_LENGTH} isMasked={false} label="Staff ID keypad" />
              {(error || isLocked) && (
                <p role="alert" className="text-center text-[13.5px] font-semibold text-flame-light">
                  {isLocked ? `Locked. Try again in ${lockSeconds}s.` : error}
                </p>
              )}
            </div>
          )}
        </section>

        <OnShift staff={staff} shifts={shifts} now={now} />
      </main>
    </div>
  );
}
