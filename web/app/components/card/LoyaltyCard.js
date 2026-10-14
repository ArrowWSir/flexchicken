"use client";
import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { STAMPS_PER_CARD, stampProgress } from "../../lib/card";
import { trackPointer } from "../../lib/pointer";

// Each stamp lands a little crooked, like a real rubber stamp.
const TILTS = [-8, 6, -3, 10, -11, 4, -6, 2];
// Logo side faces up for this long on every load, then the card turns over.
const INTRO_FLIP_DELAY_MS = 900;
const STAMP_STAGGER_MS = 80;
const FIRST_STAMP_DELAY_MS = 380;

// The brand flame, untouched, pressed into a cream disc. The logo is never
// recoloured: on the red foil it sits on cream, as a stamp would.
function StampSlot({ index, isFilled }) {
  if (isFilled) {
    return (
      <span className="flex aspect-square items-center justify-center rounded-full bg-cream shadow-[0_3px_8px_rgb(60_0_0/0.35),inset_0_-2px_3px_rgb(120_70_40/0.18)]">
        <img
          src="/brand/icon.svg"
          alt=""
          width={306}
          height={600}
          className="stamp h-[64%] w-auto"
          style={{
            "--tilt": `${TILTS[index]}deg`,
            "--stamp-delay": `${FIRST_STAMP_DELAY_MS + index * STAMP_STAGGER_MS}ms`,
          }}
        />
      </span>
    );
  }
  return (
    <span className="flex aspect-square items-center justify-center rounded-full border-[0.45cqw] border-dashed border-cream/55 text-[2.6cqw] font-semibold text-cream/60">
      {index + 1}
    </span>
  );
}

function SurpriseSlot({ isReady }) {
  return (
    <span
      className={`flex aspect-square w-full flex-col items-center justify-center rounded-full ${
        isReady
          ? "surprise-ready bg-[radial-gradient(circle_at_40%_30%,#fff1d8,var(--color-flame-light)_55%,var(--color-coral))] text-roast-900"
          : "border-[0.5cqw] border-cream/85 text-cream"
      }`}
    >
      <Gift className="size-[4.6cqw]" strokeWidth={1.9} aria-hidden="true" />
      <span className="mt-[0.5cqw] text-[1.9cqw] font-bold uppercase tracking-[0.12em]">9th</span>
    </span>
  );
}

function CardFront({ stamps, shortCode, name }) {
  const { filled, isComplete } = stampProgress(stamps);
  return (
    <span className="card-face text-cream">
      <span className="relative flex items-start justify-between px-[6cqw] pt-[5cqw]">
        <span className="leading-none">
          <span className="block font-display text-[5.4cqw] font-black uppercase tracking-[0.02em]">Flex Card</span>
          <span className="mt-[1cqw] block text-[2.7cqw] font-medium text-cream/85">
            {isComplete ? "Your 9th visit is a surprise" : `${STAMPS_PER_CARD - filled} stamps to your surprise`}
          </span>
        </span>
        <span className="max-w-[40cqw] text-right leading-none">
          <span className="block truncate text-[3.6cqw] font-semibold">{name || "Member"}</span>
          <span className="mt-[1cqw] block text-[2.8cqw] font-medium tracking-[0.2em] text-cream/80">
            #{shortCode ?? "····"}
          </span>
        </span>
      </span>

      {/* 8 stamps in 4 x 2, and the 9th-visit surprise in its own column,
          centred across both rows, set apart by a dashed rule. */}
      <span className="relative mt-auto grid grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.15fr)] gap-x-[3.6cqw] gap-y-[3cqw] px-[7cqw] pb-[6cqw]">
        <span className="col-start-5 row-span-2 row-start-1 flex items-center border-l-[0.4cqw] border-dashed border-cream/35 pl-[3.6cqw]">
          <SurpriseSlot isReady={isComplete} />
        </span>
        {Array.from({ length: STAMPS_PER_CARD }, (_, i) => (
          <StampSlot key={i} index={i} isFilled={i < filled} />
        ))}
      </span>
    </span>
  );
}

// The designer's own version for dark and red grounds (flame in colour, white
// wordmark; public/brand/logo-on-dark.svg), straight on the foil, no box.
function CardBack() {
  return (
    <span className="card-face card-back items-center justify-center">
      <img
        src="/brand/logo-on-dark.svg"
        alt=""
        width={521}
        height={294}
        className="relative h-auto w-[50cqw] drop-shadow-[0_1.4cqw_1.6cqw_rgb(60_0_0/0.45)]"
      />
      <span className="relative mt-[2cqw] text-[2.8cqw] font-semibold uppercase tracking-[0.24em] text-cream/90">
        Rainham’s local chicken shop
      </span>
    </span>
  );
}

export default function LoyaltyCard({ customer }) {
  // Every load opens logo side up, then turns over to the stamps.
  const [isFlipped, setIsFlipped] = useState(true);
  const [isRevealed, setIsRevealed] = useState(false);
  const stamps = customer?.stamps ?? 0;
  const { filled, isComplete } = stampProgress(stamps);

  // Keyed on the card, not the record: live stamp updates must not restart
  // the intro and leave the card logo side up.
  const cardId = customer?.id;
  useEffect(() => {
    if (!cardId) return undefined;
    const timer = setTimeout(() => {
      setIsFlipped(false);
      setIsRevealed(true);
    }, INTRO_FLIP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [cardId]);

  return (
    <section aria-labelledby="loyalty-heading" className="mx-auto w-full max-w-[440px]">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 id="loyalty-heading" className="font-display text-[22px] font-extrabold leading-none tracking-[-0.01em] text-ink">
          Your Flex card
        </h2>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          {isComplete ? "Surprise ready" : `${filled} / ${STAMPS_PER_CARD} stamps`}
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          setIsFlipped((flipped) => !flipped);
          setIsRevealed(true);
        }}
        onPointerMove={trackPointer}
        className="card-scene card-sheen press relative mx-auto block aspect-[1.586] w-[86%] max-w-[360px] cursor-pointer rounded-[20px]"
        aria-label={isFlipped ? "Turn the card over to see your stamps" : "Turn the card over"}
      >
        <span className="card-inner" data-flipped={isFlipped} data-revealed={isRevealed}>
          <CardFront stamps={stamps} shortCode={customer?.shortCode} name={customer?.name} />
          <CardBack />
        </span>
      </button>

      {/* On paper, so it reads over the plate photo behind the card. */}
      <p className="mx-auto mt-3 w-fit max-w-full text-balance rounded-2xl bg-ground-raised/95 px-3.5 py-2 text-center text-[13px] leading-snug text-ink shadow-paper ring-1 ring-line backdrop-blur-sm">
        Show this card at the counter. 8 stamps, and your <strong className="font-bold text-flex-ink">9th visit brings a surprise</strong>.
      </p>
      <p className="sr-only" aria-live="polite">
        {customer
          ? `Member ${customer.shortCode}. ${filled} of ${STAMPS_PER_CARD} stamps collected.` +
            (isComplete ? " Your card is full. A surprise is waiting on your next visit." : "")
          : ""}
      </p>
    </section>
  );
}
