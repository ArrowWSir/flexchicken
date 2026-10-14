"use client";
import { Plus, SlidersHorizontal } from "lucide-react";
import { defaultSelections, formatPrice, lineKey, missingRequired, toPence, validChoices } from "../lib/cart";
import QtyStepper from "../components/ui/QtyStepper";

/** What a dish needs before it can be picked: nothing, or an answer (a meal's drink). */
export function pickKind(item) {
  const defaults = defaultSelections(item);
  if (missingRequired(item, defaults).length > 0) return "choose";
  return (item.options ?? []).some((o) => !o.isRequired || o.choices.length > 1) ? "add-or-customise" : "add";
}

/**
 * One dish on the full menu: photo, name, price and how many are picked.
 * A dish with nothing to decide is added as it comes; one that needs a choice
 * opens the choices sheet (`onChoose`), and each way it was made is listed
 * under it with its own count.
 */
export default function OrderRow({ item, picks, onPick, onSetQty, onChoose }) {
  const kind = pickKind(item);
  const plainKey = lineKey(item.id, validChoices(item, defaultSelections(item)));
  const lines = picks.lines.filter((line) => line.itemId === item.id);
  const plain = kind === "choose" ? null : lines.find((line) => line.key === plainKey);
  const made = lines.filter((line) => line !== plain);

  return (
    <li className="py-3">
      <div className="flex items-center gap-3 max-[359px]:gap-2">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl max-[359px]:size-12 bg-[radial-gradient(circle_at_50%_40%,#fffaf2,var(--color-surface))]">
          {item.image ? (
            <img src={item.image} alt="" width={64} height={64} loading="lazy" className="size-[58px] object-contain max-[359px]:size-11" />
          ) : (
            <span className="size-6 rounded-full bg-line" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`text-[14.5px] font-semibold leading-snug ${item.isSoldOut ? "text-muted line-through" : "text-ink"}`}>{item.name}</h3>
          {item.description && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted max-[359px]:line-clamp-1">{item.description}</p>}
          <p className="mt-1 font-display text-[14px] font-extrabold text-flex-ink">{formatPrice(toPence(item.price))}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {item.isSoldOut ? (
            <span className="rounded-full bg-surface px-3 py-1.5 text-[12px] font-semibold text-muted">Sold out</span>
          ) : kind === "choose" ? (
            <button
              type="button"
              onClick={() => onChoose(item)}
              aria-label={`Choose ${item.name}`}
              className="press flex h-9 items-center gap-1.5 rounded-full bg-roast-800 px-3.5 text-[13px] font-semibold text-cream hover:bg-roast-700 max-[359px]:px-3"
            >
              <SlidersHorizontal className="size-3.5 max-[359px]:hidden" strokeWidth={2.4} aria-hidden="true" />
              Choose
            </button>
          ) : plain ? (
            <QtyStepper value={plain.qty} onChange={(qty) => onSetQty(plain.key, qty)} label={item.name} min={0} size="sm" />
          ) : (
            <button
              type="button"
              onClick={() => onPick(item)}
              aria-label={`Add ${item.name}`}
              className="press flex h-9 items-center gap-1 rounded-full bg-flex pl-2.5 pr-3.5 text-[13px] font-semibold text-white hover:bg-flex-deep"
            >
              <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />
              Add
            </button>
          )}
          {!item.isSoldOut && kind === "add-or-customise" && (
            <button type="button" onClick={() => onChoose(item)} className="text-[11.5px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
              Customise
            </button>
          )}
        </div>
      </div>

      {made.length > 0 && (
        <ul className="mt-2 grid gap-1.5 pl-[76px] max-[359px]:pl-0" aria-label={`${item.name} as you made it`}>
          {made.map((line) => (
            <li key={line.key} className="flex items-center justify-between gap-2 rounded-xl bg-surface/70 py-1 pl-3 pr-1">
              <span className="min-w-0 text-[12px] leading-snug text-muted">{line.choices.map((c) => c.choice).join(" · ") || "As it comes"}</span>
              <QtyStepper value={line.qty} onChange={(qty) => onSetQty(line.key, qty)} label={`${item.name}, ${line.choices.map((c) => c.choice).join(", ")}`} min={0} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
