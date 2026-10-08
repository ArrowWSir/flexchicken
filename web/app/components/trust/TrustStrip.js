import { Flame, Star } from "lucide-react";
import { BRAND } from "../../lib/brand";
import HalalSeal from "./HalalSeal";

const cell = "flex min-w-0 flex-col items-center gap-1.5 px-1.5 py-3.5 text-center";
const title = "font-display text-[13px] font-extrabold uppercase leading-none tracking-[0.02em] text-ink";
const note = "text-[11px] leading-tight text-muted";

/**
 * Three reasons to trust the shop, right before the menu: Halal, the Just Eat
 * rating and food made to order. Facts only, all from the live site.
 */
export default function TrustStrip() {
  const { rating, reviews, url } = BRAND.justEat;
  return (
    <ul
      aria-label="Why Flex Chicken"
      className="mt-8 grid grid-cols-3 divide-x divide-line rounded-[22px] bg-ground-raised shadow-paper ring-1 ring-line"
    >
      <li className={cell}>
        <HalalSeal size={34} isQuiet />
        <span className={title}>{BRAND.halal.claim}</span>
        <span className={note}>{BRAND.halal.detail}</span>
      </li>
      <li>
        <a href={url} target="_blank" rel="noreferrer" className={`${cell} press h-full rounded-none hover:bg-surface/60`}>
          <span className="flex h-[34px] items-center gap-0.5 text-flex" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className="size-3.5 fill-current" strokeWidth={0} />
            ))}
          </span>
          <span className={title}>Rated {rating.toFixed(1)}</span>
          <span className={note}>
            Just Eat · {reviews} reviews<span className="sr-only"> (opens Just Eat)</span>
          </span>
        </a>
      </li>
      <li className={cell}>
        <span className="flex size-[34px] items-center justify-center rounded-full bg-flex/10 text-flex" aria-hidden="true">
          <Flame className="size-[18px]" strokeWidth={2} />
        </span>
        <span className={title}>Made fresh</span>
        <span className={note}>Prepared to order</span>
      </li>
    </ul>
  );
}
