import { Flame } from "lucide-react";
import { BRAND } from "../../lib/brand";
import HalalSeal from "./HalalSeal";

const SEAL = 26; // px, the same as the flame chip
const cell = "flex min-w-0 items-center justify-center gap-2 px-2 py-2.5";
const title = "block font-display text-[11.5px] font-extrabold uppercase leading-none tracking-[0.02em] text-ink";
const note = "mt-0.5 block text-balance text-[10.5px] leading-tight text-muted";

/**
 * Two reasons to trust the shop, right before the menu: Halal and food made
 * to order. The Just Eat rating sits at the foot of the page instead.
 */
export default function TrustStrip() {
  return (
    <ul aria-label="Why Flex Chicken" className="mt-6 grid grid-cols-2 divide-x divide-line rounded-[18px] bg-ground-raised shadow-paper ring-1 ring-line">
      <li className={cell}>
        <HalalSeal size={SEAL} isQuiet />
        <span className="min-w-0">
          <span className={title}>{BRAND.halal.claim}</span>
          <span className={note}>{BRAND.halal.detail}</span>
        </span>
      </li>
      <li className={cell}>
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-flex/10 text-flex" aria-hidden="true">
          <Flame className="size-[15px]" strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className={title}>Made fresh</span>
          <span className={note}>Prepared to order</span>
        </span>
      </li>
    </ul>
  );
}
