"use client";
import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { ShoppingBag, Zap } from "lucide-react";
import { toPence } from "../../lib/cart";
import { useCart } from "../cart/CartProvider";
import QtyStepper from "../ui/QtyStepper";

const GBP = { style: "currency", currency: "GBP" };

// What the options amount to, in a line: "Drink: 9 choices · Add Cheese +£0.39".
function optionSummary(options) {
  return options.map((option) =>
    option.choices.length === 1
      ? `${option.choices[0].label}${option.choices[0].priceAdd ? ` +£${option.choices[0].priceAdd.toFixed(2)}` : ""}`
      : `${option.label}: ${option.choices.length} choices`
  );
}

/**
 * `item` is the dish whose words are on screen; it swaps once the old title
 * has slid out. `chosen` is the dish the visitor picked, which the table is
 * already turning to. Price, quantity and the buttons always follow `chosen`,
 * so a quick tap on Add never adds the dish that is on its way out.
 */
export default function ItemPanel({ item, chosen, phase }) {
  const { request } = useCart();
  const [qty, setQty] = useState(1);

  // A new dish starts at one portion.
  useEffect(() => setQty(1), [chosen.id]);

  const total = (toPence(chosen.price) * qty) / 100;
  const extras = optionSummary(item.options);

  return (
    <article data-phase={phase} aria-live="polite" className="rounded-[22px] bg-ground-raised p-4 ring-1 ring-line shadow-paper sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <h3 className="min-w-0 font-display uppercase leading-[0.95] text-ink">
          {item.titleLight && (
            <span className="block overflow-hidden pb-[0.06em]">
              <span className="title-line block text-[clamp(14px,3.8vw,18px)] font-medium tracking-[0.01em] text-muted">
                {item.titleLight}
              </span>
            </span>
          )}
          <span className="block overflow-hidden pb-[0.08em]">
            <span className="title-line title-line--second block text-[clamp(22px,6.4vw,34px)] font-black tracking-[-0.02em]">
              {item.titleBold}
            </span>
          </span>
        </h3>
        <p className="shrink-0 pt-0.5 font-display text-[clamp(19px,5vw,24px)] font-extrabold text-flex-ink">
          <NumberFlow value={chosen.price} format={GBP} locales="en-GB" />
        </p>
      </div>

      {(item.description || item.isMeal) && (
        <p className="mt-2 max-w-[46ch] text-[13.5px] leading-snug text-muted">
          {item.description || "Served with fries and a drink."}
        </p>
      )}

      {extras.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Options">
          {extras.map((text) => (
            <li key={text} className="rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-medium text-muted">
              {text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <QtyStepper value={qty} onChange={setQty} label={chosen.name} />
        <p className="text-[13px] text-muted">
          Total{" "}
          <strong className="font-display text-[15px] font-bold text-ink">
            <NumberFlow value={total} format={GBP} locales="en-GB" />
          </strong>
          {chosen.options.length > 0 && <span className="block text-[11px]">before extras</span>}
        </p>
      </div>

      {chosen.isSoldOut ? (
        <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-center text-[14px] font-semibold text-muted">
          Sold out for now. Back soon.
        </p>
      ) : (
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => request(chosen, qty, "add")}
          data-fly-origin={chosen.id}
          aria-label={`Add to Box: ${qty} × ${chosen.name}`}
          className="press on-dark flex h-11 items-center justify-center gap-2 rounded-2xl bg-roast-800 text-[14px] font-semibold text-cream shadow-[0_12px_22px_-14px_rgb(45_28_21/0.9)] hover:bg-roast-700"
        >
          <ShoppingBag className="size-[18px]" strokeWidth={2.1} aria-hidden="true" />
          Add to Box
        </button>
        <button
          type="button"
          onClick={() => request(chosen, qty, "buy")}
          aria-label={`Buy now: ${qty} × ${chosen.name}`}
          className="press flex h-11 items-center justify-center gap-2 rounded-2xl bg-flex text-[14px] font-semibold text-white shadow-[0_12px_22px_-12px_rgb(217_43_45/0.8)] hover:bg-flex-deep"
        >
          <Zap className="size-[18px]" strokeWidth={2.1} aria-hidden="true" />
          Buy now
        </button>
      </div>
      )}
    </article>
  );
}
