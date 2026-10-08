"use client";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { IS_CLOUD } from "../../lib/store";
import { staffAuth } from "../../lib/store/staffAuth";

export async function signOutStaff(role) {
  await staffAuth.signOut(role);
  window.location.reload();
}

/**
 * Asks for the shift code once per device. Drivers also give their name, which
 * the kitchen and the customer see on an order that is on its way.
 */
export default function StaffGate({ role, title, children }) {
  const [staff, setStaff] = useState(undefined); // undefined = not checked yet
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let isLive = true;
    staffAuth.current(role).then((record) => isLive && setStaff(record ?? null));
    return () => {
      isLive = false;
    };
  }, [role]);

  if (staff === undefined) return <div className="min-h-dvh bg-roast-950" />;
  if (staff) return children(staff);

  const submit = async (event) => {
    event.preventDefault();
    setIsBusy(true);
    try {
      setStaff(await staffAuth.signIn(role, pin, name));
    } catch (err) {
      setError(err.message);
      setPin("");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="on-dark flex min-h-dvh items-center justify-center bg-roast-950 px-5 text-cream">
      <form onSubmit={submit} className="w-full max-w-[360px]">
        <img src="/brand/logo-on-dark.svg" alt="Flex Chicken" width={92} height={52} className="h-[52px] w-auto" />
        <h1 className="mt-6 font-display text-[28px] font-black uppercase leading-none">{title}</h1>
        <p className="mt-2 text-[13.5px] text-cream/70">
          {role === "clock"
            ? "Enter the owner's code once. This tablet then works as the staff clock; staff use their own PINs."
            : "Enter the shift code to continue."}
        </p>

        {role === "driver" && (
          <label className="mt-5 grid gap-1.5 text-[13px] font-semibold">
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              className="h-12 rounded-2xl bg-cream/10 px-4 text-[16px] font-normal ring-1 ring-cream/45 focus:outline-none focus:ring-2 focus:ring-flame-light"
            />
          </label>
        )}
        <label className="mt-4 grid gap-1.5 text-[13px] font-semibold">
          Shift code
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="h-14 rounded-2xl bg-cream/10 px-4 text-center font-display text-[24px] tracking-[0.5em] ring-1 ring-cream/45 focus:outline-none focus:ring-2 focus:ring-flame-light"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-[13px] font-semibold text-flame-light">
            {error}
          </p>
        )}
        <button type="submit" disabled={isBusy} className="press mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-flex py-3.5 text-[15px] font-semibold text-white hover:bg-flex-deep">
          <Lock className="size-4" aria-hidden="true" />
          Unlock
        </button>
        <p className="mt-4 text-[11.5px] leading-snug text-cream/50">
          {IS_CLOUD
            ? "The shift code is checked by the shop's server. This device stays signed in for 30 days, or until the code is changed."
            : "Preview lock. On this test copy the shift code is checked on the device."}
        </p>
      </form>
    </main>
  );
}
