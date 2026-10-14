"use client";
import { ArrowLeft, Printer } from "lucide-react";
import { BRAND } from "../lib/brand";
import { formatPrice, toPence } from "../lib/cart";
import { hoursDisplay } from "../lib/hours";
import { useMenu, useSettings } from "../hooks/useShop";

// "Meal: comes with fries and a drink · Add Cheese +£0.39"
function optionsLine(item) {
  return item.options
    .map((option) =>
      option.choices.length === 1
        ? `${option.choices[0].label}${option.choices[0].priceAdd ? ` +${formatPrice(toPence(option.choices[0].priceAdd))}` : ""}`
        : `Choice of ${option.label.toLowerCase()}`
    )
    .join(" · ");
}

/**
 * The whole menu on one printable sheet, from the live menu (so sold-out and
 * edited dishes are right). "Save as PDF" is the browser's print dialog.
 */
export default function FullMenu() {
  const { all } = useMenu();
  const { hours } = useSettings();
  const categories = all.filter((c) => c.items.length > 0);
  return (
    <div className="menu-sheet mx-auto max-w-[900px] px-4 pb-16 pt-6 sm:px-8">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <a href="/#menu" className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-ground-raised pl-3 pr-4 text-[13px] font-semibold text-ink ring-1 ring-line hover:bg-surface">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to ordering
        </a>
        <button type="button" onClick={() => window.print()} className="press inline-flex h-11 items-center gap-2 rounded-full bg-flex px-5 text-[14px] font-semibold text-white hover:bg-flex-deep">
          <Printer className="size-4" aria-hidden="true" />
          Save as PDF or print
        </button>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
        <img src="/brand/logo.svg" alt="Flex Chicken" width={142} height={80} className="h-20 w-auto" />
        <div className="text-[12.5px] leading-relaxed text-muted sm:text-right">
          <p className="font-semibold text-ink">{BRAND.address.short}</p>
          <p>
            {BRAND.phone.label} · {hoursDisplay(hours)}
          </p>
          <p>{BRAND.halal.claim} · freshly prepared to order</p>
        </div>
      </header>

      <h1 className="mt-6 font-display text-[clamp(32px,8vw,48px)] font-black uppercase leading-none tracking-[-0.02em]">
        The <span className="text-flex">menu</span>
      </h1>

      <div className="menu-columns mt-6 gap-x-10 sm:columns-2">
        {categories.map((category) => (
          <section key={category.id} aria-labelledby={`menu-${category.id}`} className="mb-7 break-inside-avoid-column">
            <h2 id={`menu-${category.id}`} className="mb-2 border-b border-line pb-1 font-display text-[17px] font-black uppercase tracking-[0.04em] text-flex-ink">
              {category.label}
            </h2>
            <ul className="grid gap-2">
              {category.items.map((item) => (
                <li key={item.id} className="break-inside-avoid">
                  <p className="flex items-baseline gap-2 text-[14px] font-semibold">
                    <span className={item.isSoldOut ? "text-muted line-through" : ""}>{item.name}</span>
                    <span className="min-w-4 flex-1 border-b border-dotted border-muted/50" aria-hidden="true" />
                    <span className="tabular-nums">{formatPrice(toPence(item.price))}</span>
                  </p>
                  {(item.description || item.options.length > 0) && (
                    <p className="text-[12px] leading-snug text-muted">{[item.description, optionsLine(item)].filter(Boolean).join(" · ")}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[11.5px] text-muted">
        Prices and dishes can change. Allergies? Ask us before you order: {BRAND.phone.label}. Order online at flexchicken.uk.
      </p>
    </div>
  );
}
