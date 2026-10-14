"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ShoppingBag } from "lucide-react";
import { EMPTY_CART, addToCart, cartSummary, defaultSelections, formatPrice, setLineQty } from "../lib/cart";
import { useMenu } from "../hooks/useShop";
import { useCart } from "../components/cart/CartProvider";
import { OptionsDrawer } from "../components/cart/OptionsSheet";
import OrderRow from "./OrderRow";

// How long "Added to your Box" stays on the bar after a bulk add.
const ADDED_NOTE_MS = 4000;

/**
 * The whole menu as a list for ordering several dishes at once: every dish
 * under the same sections as the turning table, each with its own count.
 * Picks are a cart of their own (lib/cart), added to the Box in one go, and
 * then "Go to Box" takes the customer on to checkout to pay.
 */
export default function OrderMenu() {
  const { all } = useMenu();
  const { cart, addPicks } = useCart();
  const sections = all.filter((c) => c.items.length > 0);
  const [picks, setPicks] = useState(EMPTY_CART);
  const [choosing, setChoosing] = useState(null);
  const [added, setAdded] = useState(0);
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const chipsRef = useRef(null);

  const picked = cartSummary(picks);
  const box = cartSummary(cart);

  useEffect(() => {
    if (!added) return undefined;
    const timer = setTimeout(() => setAdded(0), ADDED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [added]);

  // The chip of the section being read stays lit as the list scrolls.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (seen) setActiveId(seen.target.dataset.section);
      },
      { rootMargin: "-130px 0px -60% 0px" }
    );
    document.querySelectorAll("[data-section]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections.length]);

  // Keep the lit chip in view in the sideways row.
  useEffect(() => {
    chipsRef.current?.querySelector(`[data-chip="${activeId}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeId]);

  const pick = (item) => setPicks((current) => addToCart(current, item, defaultSelections(item), 1));
  const setQty = (key, qty) => setPicks((current) => setLineQty(current, key, qty));
  const addAll = () => {
    addPicks(picks);
    setAdded(picked.count);
    setPicks(EMPTY_CART);
  };

  return (
    <div className="pb-40">
      <h1 className="font-display text-[clamp(30px,9vw,44px)] font-black uppercase leading-[0.92] tracking-[-0.02em]">
        Full <span className="text-flex">menu</span>
      </h1>
      <p className="mt-2 max-w-[44ch] text-[14px] leading-snug text-muted">Pick as many dishes as you like, then add them all to your Box at once.</p>

      <nav aria-label="Menu sections" className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-4 mt-4 bg-ground/90 px-4 py-2.5 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div ref={chipsRef} className="no-scrollbar flex gap-2 overflow-x-auto">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#section-${section.id}`}
              data-chip={section.id}
              aria-current={activeId === section.id ? "true" : undefined}
              className={`press shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold ring-1 ${
                activeId === section.id ? "bg-roast-800 text-cream ring-roast-800" : "bg-ground-raised text-ink ring-line hover:bg-surface"
              }`}
            >
              {section.label}
            </a>
          ))}
        </div>
      </nav>

      {sections.map((section) => (
        <section
          key={section.id}
          id={`section-${section.id}`}
          data-section={section.id}
          aria-labelledby={`heading-${section.id}`}
          // A solid sheet under each section: the plate backdrop must not show through the list.
          className="mt-4 scroll-mt-32 rounded-[22px] bg-ground-raised px-4 pb-1 pt-4 shadow-paper ring-1 ring-line"
        >
          <h2 id={`heading-${section.id}`} className="border-b border-line pb-2 font-display text-[17px] font-black uppercase tracking-[0.04em] text-flex-ink">
            {section.label}
          </h2>
          <ul className="divide-y divide-line">
            {section.items.map((item) => (
              <OrderRow key={item.id} item={item} picks={picks} onPick={pick} onSetQty={setQty} onChoose={setChoosing} />
            ))}
          </ul>
        </section>
      ))}

      <OptionsDrawer
        item={choosing}
        actionLabel="Add to my picks"
        onConfirm={(selections, qty) => {
          setPicks((current) => addToCart(current, choosing, selections, qty));
          setChoosing(null);
        }}
        onClose={() => setChoosing(null)}
      />

      <OrderBar picked={picked} box={box} added={added} onAddAll={addAll} onClear={() => setPicks(EMPTY_CART)} />
    </div>
  );
}

/** The bar along the bottom: add what is picked, then go on to the Box. */
function OrderBar({ picked, box, added, onAddAll, onClear }) {
  if (picked.count === 0 && box.count === 0) return null;
  const dishes = (n) => `${n} ${n === 1 ? "dish" : "dishes"}`;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="page-gutter pointer-events-auto mx-auto max-w-[760px] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="on-dark rounded-[22px] bg-roast-900 p-2.5 shadow-[0_18px_40px_-16px_rgb(31_19_13/0.85)]" aria-live="polite">
          {picked.count > 0 ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClear} className="press h-12 shrink-0 rounded-2xl px-3.5 text-[13px] font-semibold text-cream/75 hover:bg-cream/10 hover:text-cream">
                Clear
              </button>
              <button
                type="button"
                onClick={onAddAll}
                className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-flex px-4 text-[14.5px] font-semibold text-white hover:bg-flex-deep"
              >
                <ShoppingBag className="size-[18px]" strokeWidth={2.1} aria-hidden="true" />
                Add {dishes(picked.count)} to Box · {formatPrice(picked.subtotalPence)}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 pl-2 text-[13px] leading-snug text-cream/80">
                {added ? (
                  <span className="flex items-center gap-1.5 font-semibold text-cream">
                    <Check className="size-4 text-gold" strokeWidth={3} aria-hidden="true" />
                    Added {dishes(added)}
                  </span>
                ) : (
                  "Your Box"
                )}
                <span className="block">
                  {dishes(box.count)} · {formatPrice(box.subtotalPence)}
                </span>
              </p>
              <Link
                href="/checkout"
                className="press flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-flex px-5 text-[14.5px] font-semibold text-white hover:bg-flex-deep"
              >
                Go to Box
                <ArrowRight className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
