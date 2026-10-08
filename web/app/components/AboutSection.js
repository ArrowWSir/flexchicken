import { ArrowUpRight, Star } from "lucide-react";
import { BRAND } from "../lib/brand";
import HalalSeal from "./trust/HalalSeal";

// About us, in short. The long version lived on the old /about-us/ page.
export default function AboutSection() {
  return (
    <section aria-labelledby="about-heading" className="mt-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flex-ink">About us</p>
      <h2 id="about-heading" className="mt-1 font-display text-[clamp(26px,7.6vw,36px)] font-black uppercase leading-[0.95] tracking-[-0.02em]">
        Made in Rainham.
        <br />
        <span className="text-flex">Made to be remembered.</span>
      </h2>
      <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-muted">
        Flex Chicken is an independent local shop on Upminster Road South. We cook crispy chicken, wings, stacked
        burgers, wraps and family meals fresh for every order, with bold flavour and portions that are proper value.
      </p>

      {BRAND.shopPhoto && (
        <figure className="mt-6 overflow-hidden rounded-[26px] shadow-[0_24px_44px_-28px_rgb(45_28_21/0.7)] ring-1 ring-line">
          <img src={BRAND.shopPhoto} alt={`The ${BRAND.name} shop on ${BRAND.address.street}, ${BRAND.address.locality}`} width={1200} height={800} loading="lazy" className="aspect-[3/2] w-full object-cover" />
          <figcaption className="bg-ground-raised px-4 py-2.5 text-[12px] text-muted">{BRAND.address.short}</figcaption>
        </figure>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="on-dark flex flex-col items-start rounded-[22px] bg-roast-800 p-4 text-cream">
          <HalalSeal size={80} className="-ml-1 -mt-1" />
          <p className="mt-2 font-display text-[18px] font-black uppercase leading-none">{BRAND.halal.claim}</p>
          <p className="mt-1 text-[12.5px] text-cream/80">{BRAND.halal.detail}</p>
          {BRAND.halal.certificateUrl && (
            <a href={BRAND.halal.certificateUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-flame-light underline-offset-4 hover:underline">
              View certificate
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
        <a
          href={BRAND.justEat.url}
          target="_blank"
          rel="noreferrer"
          className="press rounded-[22px] bg-ground-raised p-4 ring-1 ring-line shadow-paper hover:ring-roast-700/30"
        >
          <span className="flex gap-0.5 text-flex" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className="size-[18px] fill-current" strokeWidth={0} />
            ))}
          </span>
          <span className="mt-3 block font-display text-[18px] font-black leading-none">
            {BRAND.justEat.rating}/5 on Just Eat
          </span>
          <span className="mt-1 block text-[12.5px] text-muted">{BRAND.justEat.reviews} verified reviews</span>
        </a>
      </div>
    </section>
  );
}
