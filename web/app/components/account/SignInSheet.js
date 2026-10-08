"use client";
import { useState } from "react";
import { Drawer } from "vaul";
import { getRepo } from "../../lib/store";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z" />
    </svg>
  );
}

/**
 * "Continue with Google / Apple". Until the backend is connected (PLAN.md,
 * P7) the provider pop-up is stood in for by this form: it asks for the name
 * and email the provider would hand back, and says plainly that it is a demo.
 */
export default function SignInSheet({ isOpen, onOpenChange, reason = "Sign in to place your order." }) {
  const [provider, setProvider] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);

  const close = (open) => {
    if (!open) {
      setProvider(null);
      setError(null);
    }
    onOpenChange(open);
  };

  const submit = (event) => {
    event.preventDefault();
    try {
      getRepo().signIn({ name, email, provider });
      close(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const providerButton =
    "press flex h-13 w-full items-center justify-center gap-3 rounded-2xl py-3.5 text-[15px] font-semibold";

  return (
    <Drawer.Root open={isOpen} onOpenChange={close}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-roast-950/45 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[560px] rounded-t-[28px] bg-ground px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none">
          <Drawer.Handle className="mt-3 !w-12 !bg-line" />
          <Drawer.Title className="mt-5 font-display text-[24px] font-black uppercase leading-none">Sign in</Drawer.Title>
          <Drawer.Description className="mt-1.5 text-[13.5px] text-muted">{reason}</Drawer.Description>

          {!provider ? (
            <div className="mt-5 grid gap-2.5">
              <button type="button" onClick={() => setProvider("google")} className={`${providerButton} bg-white text-ink ring-1 ring-line hover:bg-ground-raised`}>
                <GoogleMark />
                Continue with Google
              </button>
              <button type="button" onClick={() => setProvider("apple")} className={`${providerButton} bg-black text-white hover:bg-roast-950`}>
                <AppleMark />
                Continue with Apple
              </button>
              <p className="mt-1 text-center text-[11.5px] leading-snug text-muted">
                We only use your name, email and phone for your orders and your Flex card.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 grid gap-3" noValidate>
              <p className="rounded-2xl bg-surface px-4 py-3 text-[12.5px] leading-snug text-muted">
                <strong className="font-semibold text-ink">Preview sign-in.</strong> Real {provider === "google" ? "Google" : "Apple"} sign-in
                switches on when the shop&rsquo;s accounts are connected. For now, enter the details it would share.
              </p>
              <label className="grid gap-1.5 text-[13px] font-semibold">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                  className="h-12 rounded-2xl bg-ground-raised px-4 text-[15px] font-normal ring-1 ring-field focus:ring-2 focus:ring-flex-ink focus:outline-none"
                />
              </label>
              <label className="grid gap-1.5 text-[13px] font-semibold">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  required
                  className="h-12 rounded-2xl bg-ground-raised px-4 text-[15px] font-normal ring-1 ring-field focus:ring-2 focus:ring-flex-ink focus:outline-none"
                />
              </label>
              {error && (
                <p role="alert" className="text-[13px] font-medium text-flex-ink">
                  {error}
                </p>
              )}
              <button type="submit" className={`${providerButton} mt-1 bg-flex text-white hover:bg-flex-deep`}>
                Continue
              </button>
              <button type="button" onClick={() => setProvider(null)} className="text-[13px] font-semibold text-muted underline-offset-4 hover:underline">
                Back
              </button>
            </form>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
