"use client";
import { ArrowRight, Sparkles } from "lucide-react";
import { formatPriceShort } from "../../lib/cart";
import { livePromotions, promoBadge } from "../../lib/promotions";
import { useMenu, usePromotions } from "../../hooks/useShop";
import { useNow } from "../../hooks/useDevice";

const CLOCK_MS = 60_000;
export const SHOW_DISH_EVENT = "fc:show-dish";

/** "Ends today at 9pm", "Ends Sunday", or nothing for an open-ended offer. */
export function endsLabel(endsAt, now) {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  const sameDay = new Date(now).toDateString() === end.toDateString();
  const time = end.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
  if (sameDay) return `Ends today at ${time}`;
  const inAWeek = endsAt - now < 6 * 24 * 3_600_000;
  return `Ends ${end.toLocaleDateString("en-GB", inAWeek ? { weekday: "long" } : { day: "numeric", month: "short" })}`;
}

function showDish(itemId) {
  document.getElementById("menu")?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (itemId) window.dispatchEvent(new CustomEvent(SHOW_DISH_EVENT, { detail: { itemId } }));
}

/** One offer as a ticket. `isPreview` (the admin's editor) makes it inert. */
export function Ticket({ promo, dishNames, now, isOnly, isPreview = false }) {
  const isMoney = promo.kind !== "announce";
  const fine = [
    promo.scope === "items" && dishNames.length ? `On ${dishNames.slice(0, 3).join(", ")}${dishNames.length > 3 ? " and more" : ""}` : null,
    promo.minOrderPence ? `Orders over ${formatPriceShort(promo.minOrderPence)}` : null,
    endsLabel(promo.endsAt, now),
  ].filter(Boolean);
  return (
    <li className={`on-dark offer-ticket relative flex shrink-0 snap-start overflow-hidden rounded-[22px] bg-roast-800 text-cream ${isOnly ? "w-full" : "w-[86%] sm:w-[70%]"}`}>
      <div className="offer-stub flex w-[34%] shrink-0 flex-col items-center justify-center px-2 py-4 text-center">
        {isMoney ? (
          <span className="font-display text-[clamp(17px,5.2vw,24px)] font-black uppercase leading-[0.92] tracking-[-0.01em] text-roast-950">
            {promoBadge(promo)}
          </span>
        ) : (
          <Sparkles className="size-8 text-roast-950" strokeWidth={1.8} aria-hidden="true" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-3.5 pl-4 pr-3">
        <p className="font-display text-[15.5px] font-extrabold uppercase leading-tight">{promo.title}</p>
        {promo.detail && <p className="text-[12.5px] leading-snug text-cream/80">{promo.detail}</p>}
        {fine.length > 0 && <p className="text-[11.5px] text-flame-light">{fine.join(" · ")}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            disabled={isPreview}
            onClick={() => showDish(promo.scope === "items" ? promo.itemIds[0] : null)}
            className="press inline-flex h-8 items-center gap-1 rounded-full bg-cream px-3 text-[12.5px] font-semibold text-roast-900 hover:bg-white disabled:pointer-events-none"
          >
            Order now
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
          {isMoney && <span className="text-[11px] text-cream/65">Taken off at checkout</span>}
        </div>
      </div>
    </li>
  );
}

/**
 * The owner's live offers, under the loyalty card. One fills the width; more
 * scroll sideways. Nothing at all when there are none.
 */
export default function OfferStrip() {
  const promotions = usePromotions();
  const { all } = useMenu();
  const now = useNow(CLOCK_MS);
  const live = livePromotions(promotions, now);
  if (!live.length) return null;
  const nameOf = new Map(all.flatMap((c) => c.items.map((i) => [i.id, i.name])));
  return (
    <section aria-label="Offers" className="mt-5">
      <ul className="no-scrollbar scroll-row -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 sm:-mx-8 sm:scroll-px-8 sm:px-8">
        {live.map((promo) => (
          <Ticket key={promo.id} promo={promo} now={now} isOnly={live.length === 1} dishNames={promo.itemIds.map((id) => nameOf.get(id)).filter(Boolean)} />
        ))}
      </ul>
    </section>
  );
}
