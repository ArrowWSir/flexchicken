"use client";
import { useState } from "react";
import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { formatPriceShort } from "../../lib/cart";
import { promoBadge, promoStatus } from "../../lib/promotions";
import { getRepo } from "../../lib/store";
import { usePromotions } from "../../hooks/useShop";
import { useNow } from "../../hooks/useDevice";
import { endsLabel } from "../../components/offers/OfferStrip";
import OfferEditor, { EMPTY_DRAFT, draftOf } from "./OfferEditor";

const CLOCK_MS = 60_000;
const STATUS = {
  live: { label: "Live", tone: "bg-go text-white" },
  scheduled: { label: "Scheduled", tone: "bg-flame-light text-roast-950" },
  paused: { label: "Paused", tone: "bg-cream/15 text-cream" },
  ended: { label: "Ended", tone: "bg-cream/10 text-cream/70" },
};
const ORDER = ["live", "scheduled", "paused", "ended"];

function when(promo, now) {
  if (promo.startsAt && now < promo.startsAt) {
    return `Starts ${new Date(promo.startsAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`;
  }
  return endsLabel(promo.endsAt, now) ?? "No end date";
}

/** The owner's offers: write one, watch it go live, pause or bin it. */
export default function OffersStudio() {
  const promotions = usePromotions();
  const now = useNow(CLOCK_MS);
  const [editing, setEditing] = useState(null); // a draft, or null
  const [error, setError] = useState(null);

  const save = async (input) => {
    await getRepo().savePromotion(input); // rejects with what to fix; the editor shows it
    setEditing(null);
  };
  const act = async (fn) => {
    try {
      await fn();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };
  const sorted = [...promotions].sort((a, b) => ORDER.indexOf(promoStatus(a, now)) - ORDER.indexOf(promoStatus(b, now)));

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-black uppercase leading-none">Offers</h1>
          <p className="mt-1 text-[13px] text-cream/60">Shown on the website right under the loyalty card.</p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(EMPTY_DRAFT)} className="press flex h-11 items-center gap-1.5 rounded-xl bg-flame-light px-4 text-[14px] font-bold text-roast-950">
            <Plus className="size-4" aria-hidden="true" />
            New offer
          </button>
        )}
      </div>

      {editing && <OfferEditor key={editing.id ?? "new"} initial={editing} onSave={save} onCancel={() => setEditing(null)} />}
      {error && (
        <p role="alert" className="rounded-xl bg-flex/20 px-4 py-2.5 text-[13px] font-semibold text-flame-light">
          {error}
        </p>
      )}

      {sorted.length === 0 && !editing && (
        <p className="rounded-2xl bg-roast-900 p-5 text-[14px] text-cream/70 ring-1 ring-cream/10">
          No offers yet. Try “Buy one, get one free” on a burger, or 20% off orders over £20.
        </p>
      )}
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {sorted.map((promo) => {
          const status = STATUS[promoStatus(promo, now)];
          return (
            <li key={promo.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-roast-900 p-3.5 ring-1 ring-cream/10">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(160deg,#fcc282,#f5845c)] p-1.5 text-center font-display text-[12px] font-black uppercase leading-[0.95] text-roast-950">
                {promo.kind === "announce" ? "News" : promoBadge(promo)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[15px] font-semibold">{promo.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${status.tone}`}>{status.label}</span>
                </span>
                <span className="block text-[12.5px] text-cream/65">
                  {when(promo, now)}
                  {promo.minOrderPence ? ` · over ${formatPriceShort(promo.minOrderPence)}` : ""}
                  {promo.scope === "items" ? ` · ${promo.itemIds.length} dish${promo.itemIds.length === 1 ? "" : "es"}` : ""}
                </span>
              </span>
              <span className="flex gap-1.5">
                <button type="button" onClick={() => setEditing(draftOf(promo))} className="press flex size-10 items-center justify-center rounded-xl ring-1 ring-cream/15 hover:bg-cream/10" aria-label={`Edit ${promo.title}`}>
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => act(() => getRepo().savePromotion({ ...promo, isActive: !promo.isActive }))}
                  className="press flex size-10 items-center justify-center rounded-xl ring-1 ring-cream/15 hover:bg-cream/10"
                  aria-label={`${promo.isActive ? "Pause" : "Resume"} ${promo.title}`}
                >
                  {promo.isActive ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={() => window.confirm(`Delete the offer “${promo.title}”?`) && act(() => getRepo().removePromotion(promo.id))}
                  className="press flex size-10 items-center justify-center rounded-xl text-flame-light ring-1 ring-flex/60 hover:bg-flex/20"
                  aria-label={`Delete ${promo.title}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
