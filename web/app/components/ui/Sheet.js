"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Centred dialog used by the card's own actions and the counter's lists.
// Keyboard: Escape closes, focus moves in on open and back to the trigger on
// close, and Tab stays inside.
export default function Sheet({ isOpen, onClose, title, children, tone = "dark" }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const panelRef = useRef(null);
  const returnTo = useRef(null);
  // Callers pass an inline onClose, so keep it in a ref: a changing prop must
  // not re-run the effect below, which would pull focus out of an input the
  // visitor is typing into.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    returnTo.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") return closeRef.current();
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      returnTo.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  // Rendered into <body>: the card column is sticky, which traps a fixed child
  // beneath later sections of the page (the menu card painted over the sheet).
  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative max-h-[86dvh] w-full max-w-md overflow-y-auto rounded-[28px] p-5 shadow-[0_24px_70px_rgb(0_0_0/0.65)] outline-none ${
          tone === "light"
            ? "bg-[#f5f3ee] text-ink ring-1 ring-stone-200"
            : "bg-ground-raised text-ink ring-1 ring-ink/[0.1]"
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className={`text-[15px] font-semibold uppercase tracking-[0.18em] ${tone === "light" ? "text-ink" : "hidden"}`}>
            {title}
          </h2>
          {tone !== "light" && (
            <h2 className="font-script text-[26px] leading-none text-oliva-700">{title}</h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`press flex size-9 items-center justify-center rounded-full ${
              tone === "light" ? "bg-white text-ink ring-1 ring-stone-200" : "bg-ink/[0.06] text-ink hover:bg-ink/[0.1]"
            }`}
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
