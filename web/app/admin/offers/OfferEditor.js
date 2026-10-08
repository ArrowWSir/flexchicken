"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { PROMO_KINDS, minOrderFromPounds } from "../../lib/promotions";
import { useMenu } from "../../hooks/useShop";
import { Ticket } from "../../components/offers/OfferStrip";
import { FIELD, Toggle } from "../ui";

const pad = (n) => String(n).padStart(2, "0");
/** ms -> the value a datetime-local input wants, in local time. */
function toLocalInput(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (value) => (value ? new Date(value).getTime() : null);

export const EMPTY_DRAFT = { kind: "percent", title: "", detail: "", percent: "50", scope: "order", itemIds: [], minOrder: "", startsAt: "", endsAt: "", isActive: true };

export function draftOf(promo) {
  return {
    ...promo,
    percent: promo.percent ? String(promo.percent) : "50",
    minOrder: promo.minOrderPence ? (promo.minOrderPence / 100).toFixed(2) : "",
    startsAt: toLocalInput(promo.startsAt),
    endsAt: toLocalInput(promo.endsAt),
  };
}

/** The draft as the repo takes it (it validates and explains). */
export function inputOf(draft) {
  return {
    ...draft,
    percent: Number(draft.percent),
    minOrderPence: minOrderFromPounds(draft.minOrder),
    startsAt: fromLocalInput(draft.startsAt),
    endsAt: fromLocalInput(draft.endsAt),
  };
}

function DishPicker({ selected, onChange }) {
  const { all } = useMenu();
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <fieldset className="grid gap-2">
      <legend className="text-[13px] font-semibold">
        Dishes <span className="font-normal text-cream/60">· {selected.length} chosen</span>
      </legend>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter dishes" aria-label="Filter dishes" className={`${FIELD} h-10 text-[14px]`} />
      <div className="max-h-64 overflow-y-auto rounded-xl bg-cream/5 p-2 ring-1 ring-cream/10">
        {all.map((category) => {
          const items = category.items.filter((i) => !q || i.name.toLowerCase().includes(q));
          if (!items.length) return null;
          return (
            <div key={category.id} className="mb-2 last:mb-0">
              <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-cream/55">{category.label}</p>
              {items.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[14px] hover:bg-cream/5">
                  <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="size-4 accent-[#fcc282]" />
                  {item.name}
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Write an offer and see it as customers will. Saving goes through the
 * repo, which checks it and says what to fix.
 */
export default function OfferEditor({ initial, onSave, onCancel }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const { all } = useMenu();
  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };
  const isMoney = draft.kind !== "announce";
  const isDishes = draft.kind === "bogof" || (draft.kind === "percent" && draft.scope === "items");
  const nameOf = new Map(all.flatMap((c) => c.items.map((i) => [i.id, i.name])));
  const preview = { ...inputOf(draft), title: draft.title || "Your headline", scope: draft.kind === "bogof" ? "items" : draft.scope, percent: Number(draft.percent) || 0 };

  const submit = async (event) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave(inputOf(draft));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} aria-labelledby="offer-editor-heading" className="grid gap-5 rounded-[24px] bg-roast-900 p-4 ring-1 ring-flame-light/30 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="grid min-w-0 content-start gap-4">
        <h2 id="offer-editor-heading" className="font-display text-[18px] font-black uppercase">
          {initial.id ? "Edit offer" : "New offer"}
        </h2>

        <fieldset className="grid gap-2">
          <legend className="text-[13px] font-semibold">Kind of offer</legend>
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-cream/5 p-1 ring-1 ring-cream/10">
            {Object.entries(PROMO_KINDS).map(([kind, label]) => (
              <label key={kind} className={`press flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-2 text-center text-[12.5px] font-semibold leading-tight ${draft.kind === kind ? "bg-flame-light text-roast-950" : "text-cream/75 hover:text-cream"}`}>
                <input type="radio" name="kind" value={kind} checked={draft.kind === kind} onChange={() => set({ kind })} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="grid gap-1.5 text-[13px] font-semibold">
          Headline
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={40} placeholder="e.g. Wing Wednesday" className={FIELD} />
        </label>
        <label className="grid gap-1.5 text-[13px] font-semibold">
          <span>Details <span className="font-normal text-cream/60">(optional)</span></span>
          <textarea value={draft.detail} onChange={(e) => set({ detail: e.target.value })} maxLength={140} rows={2} placeholder="One line customers will read" className={`${FIELD} h-auto py-2.5`} />
        </label>

        {draft.kind === "percent" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid min-w-0 gap-1.5 text-[13px] font-semibold">
              Discount
              <span className="flex items-center gap-2">
                <input type="number" min="5" max="90" step="5" inputMode="numeric" value={draft.percent} onChange={(e) => set({ percent: e.target.value })} className={`${FIELD} min-w-0`} />
                <span className="text-cream/60">%</span>
              </span>
            </label>
            <label className="grid min-w-0 gap-1.5 text-[13px] font-semibold">
              Off
              <select value={draft.scope} onChange={(e) => set({ scope: e.target.value })} className={`${FIELD} min-w-0`}>
                <option value="order">The whole order</option>
                <option value="items">Chosen dishes</option>
              </select>
            </label>
          </div>
        )}
        {isDishes && <DishPicker selected={draft.itemIds} onChange={(itemIds) => set({ itemIds })} />}

        {isMoney && (
          <label className="grid gap-1.5 text-[13px] font-semibold">
            <span>Minimum order <span className="font-normal text-cream/60">(optional)</span></span>
            <span className="flex items-center gap-2">
              <span className="text-cream/60">£</span>
              <input type="number" min="0" step="0.5" inputMode="decimal" value={draft.minOrder} onChange={(e) => set({ minOrder: e.target.value })} placeholder="none" className={`${FIELD} min-w-0`} />
            </span>
          </label>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1.5 text-[13px] font-semibold">
            <span>Starts <span className="font-normal text-cream/60">(blank: now)</span></span>
            <input type="datetime-local" value={draft.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className={`${FIELD} min-w-0 [color-scheme:dark]`} />
          </label>
          <label className="grid min-w-0 gap-1.5 text-[13px] font-semibold">
            <span>Ends <span className="font-normal text-cream/60">(blank: until you stop it)</span></span>
            <input type="datetime-local" value={draft.endsAt} onChange={(e) => set({ endsAt: e.target.value })} className={`${FIELD} min-w-0 [color-scheme:dark]`} />
          </label>
        </div>

        <Toggle label="Show on the website" hint={draft.isActive ? "Live when its time comes" : "Saved, but hidden"} checked={draft.isActive} onChange={(isActive) => set({ isActive })} />

        {error && (
          <p role="alert" className="rounded-xl bg-flex/20 px-4 py-2.5 text-[13px] font-semibold text-flame-light">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={isSaving} className="press flex h-11 items-center gap-1.5 rounded-xl bg-flame-light px-5 text-[14px] font-bold text-roast-950">
            <Check className="size-4" aria-hidden="true" />
            Save offer
          </button>
          <button type="button" onClick={onCancel} className="press flex h-11 items-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold ring-1 ring-cream/15 hover:bg-cream/5">
            <X className="size-4" aria-hidden="true" />
            Cancel
          </button>
        </div>
      </div>

      <div className="grid min-w-0 content-start gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-cream/60">How customers see it</p>
        <div className="rounded-[24px] bg-ground p-4">
          <ul className="flex">
            <Ticket promo={preview} now={Date.now()} isOnly isPreview dishNames={preview.itemIds.map((id) => nameOf.get(id)).filter(Boolean)} />
          </ul>
        </div>
        <p className="text-[12px] text-cream/60">
          Shown under the loyalty card. Money offers come off the Box by themselves; if two offers fit an order, the customer gets the bigger saving.
        </p>
      </div>
    </form>
  );
}
