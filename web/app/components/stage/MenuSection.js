"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMenu } from "../../hooks/useShop";
import useDishSlider from "../../hooks/useDishSlider";
import useFitText from "../../hooks/useFitText";
import BadgeGrid from "../badges/BadgeGrid";
import TableStage from "./TableStage";
import ItemRail from "./ItemRail";
import ItemPanel from "./ItemPanel";
import { SHOW_DISH_EVENT } from "../offers/OfferStrip";
import MenuDownload from "../menu/MenuDownload";

// The bold line is sized from its longest word (Montserrat black caps run
// about 0.68em a letter), so a long name wraps onto a second line rather than
// shrinking to nothing; useFitText then trims any word that still overflows.
const BOLD_GLYPH_EM = 0.68;
const BOLD_MAX_CQW = 24;

function boldSize(words) {
  const longest = Math.max(...words.split(/\s+/).map((w) => w.length), 1);
  return `${Math.min(BOLD_MAX_CQW, 100 / (longest * BOLD_GLYPH_EM)).toFixed(2)}cqw`;
}

// The dish's name in the menu card, left of the table, as in a shop window.
// It slides out and the next one in while the table turns (data-phase).
function StageTitle({ item, phase }) {
  const lightRef = useRef(null);
  const boldRef = useRef(null);
  useFitText([lightRef, boldRef], `${item.titleLight}|${item.titleBold}`);
  return (
    <div className="pointer-events-none absolute inset-y-0 left-5 z-[2000] flex w-[42%] flex-col justify-center" data-phase={phase}>
      <h3 className="font-display uppercase leading-[0.95] text-cream [container-type:inline-size] [text-shadow:0_2px_14px_rgb(0_0_0/0.6)]" aria-live="polite">
        {item.titleLight && (
          <span className="block overflow-hidden pb-[0.06em]">
            <span ref={lightRef} className="title-line block whitespace-nowrap text-[calc(12cqw*var(--fit,1))] font-medium leading-[1.1] tracking-[0.04em] text-cream/80">
              {item.titleLight}
            </span>
          </span>
        )}
        <span className="block overflow-hidden pb-[0.06em]">
          <span
            ref={boldRef}
            className="title-line title-line--second block font-black tracking-[-0.02em] [text-wrap:balance]"
            style={{ fontSize: `calc(${boldSize(item.titleBold)} * var(--fit, 1))` }}
          >
            {item.titleBold}
          </span>
        </span>
        {/* The flame bar from the logo: the card's one touch of red. */}
        <span className="mt-[5cqw] block h-[3px] w-[26cqw] rounded-full bg-[linear-gradient(90deg,var(--color-flame-light),var(--color-flex))]" aria-hidden="true" />
      </h3>
    </div>
  );
}

// Phone first. The owner's wireframe put the badges beside the table; on a
// phone that leaves the table a sliver, so the badges sit above it as one
// thumb-sized grid, and the menu card takes the full width: the dish's name on
// the left, the turning table on the right. Price and actions follow.
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
      {/* backdrop-calm: the plate backdrop softens behind the badges (globals.css). */}
      <div className="backdrop-calm">
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
      </div>

      <div ref={tableRef} className="mt-4 scroll-mt-20">
        {/* isolate: plates stack among themselves, never above the sticky header. */}
        <div className="menu-vitrine on-dark relative isolate aspect-[25/20] w-full overflow-hidden rounded-[28px]">
          <TableStage
            items={category.items}
            activeIndex={activeIndex}
            onSelect={(index) => goTo(target.categoryId, index)}
            onStep={step}
            isReducedMotion={isReducedMotion}
            label={`${category.label}: ${category.items[activeIndex]?.name}`}
          />
          <div className="menu-vitrine-shade pointer-events-none absolute inset-y-0 left-0 z-[1500] w-[62%]" aria-hidden="true" />
          {shownItem && <StageTitle item={shownItem} phase={phase} />}
          <p className="pointer-events-none absolute bottom-3 left-5 z-[2000] text-[11px] font-medium text-cream/60" aria-hidden="true">
            ← Swipe the table →
          </p>
        </div>
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
