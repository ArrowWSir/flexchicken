"use client";
import { useState } from "react";
import { CupSoda, Plus } from "lucide-react";
import { formatPrice, toPence } from "../lib/cart";
import { useMenu } from "../hooks/useShop";
import { useCart } from "./cart/CartProvider";
import QtyStepper from "./ui/QtyStepper";

function DrinkCard({ drink }) {
  const { request } = useCart();
  const [qty, setQty] = useState(1);
  return (
    <li className="flex w-[172px] shrink-0 snap-start flex-col rounded-[22px] bg-ground-raised p-3 ring-1 ring-line shadow-paper">
      <span data-fly-source={drink.id} className="relative flex aspect-square items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_50%_35%,#fffaf2,var(--color-surface))]">
        {drink.image ? (
          <img src={drink.image} alt="" width={720} height={720} loading="lazy" className="size-[88%] object-contain" />
        ) : (
          <CupSoda className="size-10 text-roast-700/45" strokeWidth={1.5} aria-hidden="true" />
        )}
      </span>
      <span className="mt-2.5 text-[13.5px] font-semibold leading-tight">{drink.name}</span>
      <span className="text-[13px] font-semibold text-flex-ink">{formatPrice(toPence(drink.price))}</span>
      {drink.isSoldOut ? (
        <span className="mt-2.5 rounded-full bg-surface py-2 text-center text-[12px] font-semibold text-muted">Sold out</span>
      ) : (
      <div className="mt-2.5 flex items-center justify-between gap-1">
        <QtyStepper value={qty} onChange={setQty} label={drink.name} size="sm" />
        <button
          type="button"
          onClick={() => {
            request(drink, qty, "add");
            setQty(1);
          }}
          className="press on-dark flex size-9 shrink-0 items-center justify-center rounded-full bg-roast-800 text-cream hover:bg-roast-700"
          aria-label={`Add ${qty} ${drink.name} to your Box`}
        >
          <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />
        </button>
      </div>
      )}
    </li>
  );
}

export default function DrinksSection() {
  const { drinks: DRINKS } = useMenu();
  if (!DRINKS || DRINKS.items.length === 0) return null;
  return (
    <section aria-labelledby="drinks-heading" className="mt-14">
      <div className="mb-4 flex items-end justify-between">
        <h2 id="drinks-heading" className="font-display text-[24px] font-black uppercase tracking-[-0.01em]">
          Drinks
        </h2>
        <p className="text-[12px] text-muted">Ice cold · {DRINKS.items.length} to choose from</p>
      </div>
      <ul className="no-scrollbar scroll-row -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:scroll-px-8 sm:px-8" aria-label="Drinks">
        {DRINKS.items.map((drink) => (
          <DrinkCard key={drink.id} drink={drink} />
        ))}
      </ul>
    </section>
  );
}
