"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMenu } from "../../hooks/useShop";
import useDishSlider from "../../hooks/useDishSlider";
import BadgeGrid from "../badges/BadgeGrid";
import TableStage from "./TableStage";
import ItemRail from "./ItemRail";
import ItemPanel from "./ItemPanel";
import { SHOW_DISH_EVENT } from "../offers/OfferStrip";
import MenuDownload from "../menu/MenuDownload";

// Phone first. The owner's wireframe put the badges beside the table; on a
// phone that leaves the table a sliver, so the badges sit above it as one
// thumb-sized grid, and the table takes the full width, still running off the
// right edge of the frame. The dishes' names and actions follow.
export default function MenuSection() {
  const { categories } = useMenu();
  const { target, shown, phase, goTo, step, isReducedMotion } = useDishSlider(categories);
  // The owner may remove a dish or a whole category while this page is open.
  const findCategory = (id) => categories.find((c) => c.id === id) ?? categories[0];
  const category = findCategory(target.categoryId);
  const activeIndex = Math.min(target.index, category.items.length - 1);
  const shownCategory = findCategory(shown.categoryId);
  const shownItem = shownCategory.items[Math.min(shown.index, shownCategory.items.length - 1)];
  const tableRef = useRef(null);
  // The names list is folded away by default: the table and the arrows are
  // enough to browse, and the list opens for anyone who wants to jump.
  const [isListOpen, setIsListOpen] = useState(false);
  const listId = useId();

  // An offer's "Order now" turns the table to its dish.
  useEffect(() => {
    const show = (event) => {
      for (const c of categories) {
        const index = c.items.findIndex((item) => item.id === event.detail?.itemId);
        if (index >= 0) return goTo(c.id, index);
      }
      return undefined;
    };
    window.addEventListener(SHOW_DISH_EVENT, show);
    return () => window.removeEventListener(SHOW_DISH_EVENT, show);
  }, [categories, goTo]);

  const chooseCategory = (categoryId) => {
    if (categoryId !== target.categoryId) goTo(categoryId, 0);
    // Bring the table into view if the visitor has scrolled past it.
    const table = tableRef.current;
    if (table && table.getBoundingClientRect().top > window.innerHeight * 0.6) {
      table.scrollIntoView({ behavior: isReducedMotion ? "auto" : "smooth", block: "start" });
    }
  };

  return (
    <section id="menu" aria-labelledby="menu-heading" className="mt-12 scroll-mt-20">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flex-ink">Order here</p>
          <h2 id="menu-heading" className="mt-1 font-display text-[clamp(28px,8.4vw,40px)] font-black uppercase leading-[0.92] tracking-[-0.02em]">
            Pick your <span className="text-flex">craving</span>
          </h2>
        </div>
        <MenuDownload
          label="Menu"
          className="press mb-0.5 flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ground-raised px-3.5 text-[13px] font-semibold text-ink ring-1 ring-line hover:bg-surface"
        />
      </div>

      <BadgeGrid categories={categories} activeId={target.categoryId} onSelect={chooseCategory} />

      <div ref={tableRef} className="relative isolate -mr-4 mt-4 scroll-mt-20 sm:-mr-8">
        {/* isolate: plates stack among themselves, never above the sticky header. */}
        <div className="relative aspect-[1/0.78] w-full">
          <TableStage
            items={category.items}
            activeIndex={activeIndex}
            onSelect={(index) => goTo(target.categoryId, index)}
            onStep={step}
            isReducedMotion={isReducedMotion}
            label={`${category.label}: ${category.items[activeIndex]?.name}`}
          />
        </div>
        <p className="pointer-events-none absolute bottom-1 left-0 text-[11px] font-medium text-muted" aria-hidden="true">
          ← Swipe the table →
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-[14px] font-extrabold uppercase tracking-[0.06em]">{category.label}</h3>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => step(-1)}
              className="press flex size-8 items-center justify-center rounded-full bg-surface text-ink hover:bg-line"
              aria-label="Previous dish"
            >
              <ChevronLeft className="size-4" strokeWidth={2.4} aria-hidden="true" />
            </button>
            <span className="min-w-12 text-center text-[12px] tabular-nums text-muted">
              {activeIndex + 1} of {category.items.length}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              className="press flex size-8 items-center justify-center rounded-full bg-surface text-ink hover:bg-line"
              aria-label="Next dish"
            >
              <ChevronRight className="size-4" strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsListOpen((open) => !open)}
          aria-expanded={isListOpen}
          aria-controls={listId}
          className="press flex h-10 w-full items-center justify-between rounded-full bg-ground-raised px-4 text-[13.5px] font-semibold text-ink ring-1 ring-line hover:bg-surface"
        >
          <span>
            All dishes <span className="font-normal text-muted">· {category.items.length}</span>
          </span>
          <ChevronDown
            className={`size-[18px] transition-transform duration-300 motion-reduce:transition-none ${isListOpen ? "rotate-180" : ""}`}
            strokeWidth={2.4}
            aria-hidden="true"
          />
        </button>
        {/* 0fr -> 1fr slides the list open; inert keeps it out of reach while folded. */}
        <div
          id={listId}
          inert={!isListOpen}
          className={`-mx-4 grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none sm:-mx-8 ${
            isListOpen ? "grid-rows-[1fr] opacity-100" : "!mt-0 grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden px-4 sm:px-8">
            <ItemRail
              items={category.items}
              activeIndex={activeIndex}
              onSelect={(index) => goTo(target.categoryId, index)}
              isReducedMotion={isReducedMotion}
            />
          </div>
        </div>
        {shownItem && <ItemPanel item={shownItem} chosen={category.items[activeIndex]} phase={phase} />}
      </div>
    </section>
  );
}
