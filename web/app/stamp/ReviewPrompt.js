"use client";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ExternalLink, Mail, MessageCircle, Star } from "lucide-react";
import { STARS, emailUrl, feedbackMessage, googleReviewUrl, isGoodRating, whatsappUrl } from "../lib/review";

const LABELS = ["", "Poor", "Not great", "OK", "Good", "Loved it"];
// Long enough to read "thank you" before the page changes.
const GOOGLE_REDIRECT_MS = 900;

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const isReduced = useReducedMotion();
  const shown = hover || value;
  return (
    <fieldset className="mt-4">
      <legend className="sr-only">Your rating, out of {STARS} stars</legend>
      <div className="flex justify-center gap-1 min-[360px]:gap-1.5" onMouseLeave={() => setHover(0)}>
        {Array.from({ length: STARS }, (_, i) => i + 1).map((n) => (
          <label key={n} className="cursor-pointer rounded-xl p-0.5 min-[360px]:p-1 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-flex-ink" onMouseEnter={() => setHover(n)}>
            <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            <span className="sr-only">
              {n} star{n === 1 ? "" : "s"}, {LABELS[n]}
            </span>
            <motion.span
              aria-hidden="true"
              className="block"
              animate={value === n && !isReduced ? { scale: [1, 1.28, 1], rotate: [0, -8, 0] } : { scale: 1 }}
              transition={{ duration: 0.32 }}
              whileTap={isReduced ? undefined : { scale: 0.88 }}
            >
              <Star
                className={`size-9 transition-colors min-[360px]:size-11 duration-150 ${n <= shown ? "fill-flex text-flex" : "fill-transparent text-field"}`}
                strokeWidth={1.8}
              />
            </motion.span>
          </label>
        ))}
      </div>
      <p className="mt-1.5 h-5 text-center text-[13px] font-semibold text-muted">{LABELS[shown]}</p>
    </fieldset>
  );
}

function SorryPanel({ stars, orderNumber }) {
  const [note, setNote] = useState("");
  const text = feedbackMessage({ stars, orderNumber, note });
  const whatsapp = whatsappUrl(text);
  return (
    <div>
      <h2 className="font-display text-[22px] font-black uppercase leading-tight">Sorry about that</h2>
      <p className="mt-1.5 text-[14px] leading-snug text-muted">Tell us what went wrong and we'll fix it. It comes straight to the shop.</p>
      <label className="mt-4 block text-[13px] font-semibold" htmlFor="feedback-note">
        What went wrong? <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id="feedback-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={1000}
        className="mt-1.5 w-full resize-none rounded-xl bg-white px-3 py-2.5 text-[14.5px] ring-1 ring-field focus:outline-2 focus:outline-flex-ink"
      />
      <div className="mt-3 grid gap-2">
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-go text-[15px] font-bold text-white hover:bg-go-deep">
            <MessageCircle className="size-5" aria-hidden="true" />
            Message us on WhatsApp
          </a>
        )}
        <a
          href={emailUrl(text, { stars, orderNumber })}
          className={`press flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold ${
            whatsapp ? "bg-surface text-ink hover:bg-line" : "bg-roast-800 text-cream hover:bg-roast-700"
          }`}
        >
          <Mail className="size-5" aria-hidden="true" />
          Email us
        </a>
      </div>
      <p className="mt-4 text-center text-[12.5px] text-muted">
        or{" "}
        <a href={googleReviewUrl()} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
          review us on Google
        </a>
      </p>
    </div>
  );
}

/** Optional: the stamp is already on the card whatever happens here. */
export default function ReviewPrompt({ orderNumber }) {
  const [stars, setStars] = useState(0);
  const [step, setStep] = useState("ask");

  const submit = (event) => {
    event.preventDefault();
    if (!stars) return;
    if (!isGoodRating(stars)) return setStep("sorry");
    setStep("google");
    setTimeout(() => window.location.assign(googleReviewUrl()), GOOGLE_REDIRECT_MS);
  };

  if (step === "skipped") return null;

  return (
    <section aria-label="Rate your food" className="rounded-[24px] bg-ground-raised p-5 shadow-paper ring-1 ring-line">
      {step === "ask" && (
        <form onSubmit={submit}>
          <h2 className="text-center font-display text-[24px] font-black uppercase leading-tight">How was your food?</h2>
          <p className="mt-1 text-center text-[13.5px] text-muted">Optional. Your stamp is yours either way.</p>
          <StarPicker value={stars} onChange={setStars} />
          <button
            type="submit"
            disabled={!stars}
            className="press mt-4 h-12 w-full rounded-xl bg-flex text-[15px] font-bold text-white hover:bg-flex-deep disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
          >
            Submit
          </button>
          <button type="button" onClick={() => setStep("skipped")} className="mt-2 h-10 w-full rounded-xl text-[13.5px] font-semibold text-muted hover:text-ink">
            No thanks
          </button>
        </form>
      )}

      {step === "google" && (
        <div className="text-center" role="status">
          <h2 className="font-display text-[22px] font-black uppercase leading-tight">Thank you!</h2>
          <p className="mt-1.5 text-[14px] text-muted">Taking you to Google to share it…</p>
          <a href={googleReviewUrl()} className="press mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-roast-800 px-4 text-[14px] font-bold text-cream hover:bg-roast-700">
            <ExternalLink className="size-4" aria-hidden="true" />
            Open Google reviews
          </a>
        </div>
      )}

      {step === "sorry" && <SorryPanel stars={stars} orderNumber={orderNumber} />}
    </section>
  );
}
