"use client";
import { useRef, useState } from "react";
import { Download, Plus, Save, X } from "lucide-react";
import { formatPrice } from "../../lib/cart";
import { MAX_LINES, parsePrice, priceInput, sheetTotals, todayIso } from "../../lib/expenses";
import { field } from "../staff/StaffRow";

const START_LINES = 3;
let lineSeq = 0;
const newLine = () => ({ id: `ln_${Date.now().toString(36)}${(lineSeq += 1)}`, item: "", qty: "", source: "", price: "" });

export const emptyDraft = () => ({ id: null, title: "", date: todayIso(), note: "", lines: Array.from({ length: START_LINES }, newLine) });

/** A saved sheet as the editor holds it: prices as typed text. */
export const draftOf = (sheet) => ({
  id: sheet.id,
  title: sheet.title,
  date: sheet.date,
  note: sheet.note,
  lines: sheet.lines.map((l) => ({ id: l.id, item: l.item, qty: l.qty, source: l.source, price: priceInput(l.pricePence) })),
});

// The live total as the owner types: a price that is not one yet counts as none.
function liveTotals(draft) {
  const lines = draft.lines
    .filter((l) => l.item.trim())
    .map((l) => {
      let pricePence = null;
      try {
        pricePence = parsePrice(l.price);
      } catch {
        // Shown under the field; saving names it.
      }
      return { ...l, pricePence };
    });
  return sheetTotals({ lines });
}

function isBadPrice(text) {
  try {
    parsePrice(text);
    return false;
  } catch {
    return true;
  }
}

const small = "text-[11.5px] font-semibold text-cream/60 md:sr-only";

function LineRow({ line, index, onChange, onRemove, onEnterLast, isLast, canRemove, sourcesId }) {
  const set = (key) => (event) => onChange({ ...line, [key]: event.target.value });
  const isBad = isBadPrice(line.price);
  const n = index + 1;
  return (
    <li className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl bg-cream/5 p-2.5 ring-1 ring-cream/10 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] md:items-start md:rounded-xl md:bg-transparent md:p-0 md:ring-0">
      <label className="grid gap-1">
        <span className={small}>Item {n}</span>
        <input value={line.item} onChange={set("item")} aria-label={`Item ${n}`} placeholder="e.g. Chicken wings" maxLength={80} className={field} />
      </label>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove item ${n}`}
        className="press mt-[22px] flex size-11 items-center justify-center rounded-xl text-cream/60 hover:bg-flex/25 hover:text-cream disabled:opacity-30 md:order-last md:mt-0"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      {/* Phones: Qty and Price side by side, Source on its own row below. */}
      <div className="col-span-2 grid grid-cols-2 gap-2 md:contents">
        <label className="grid gap-1">
          <span className={small}>Qty</span>
          <input value={line.qty} onChange={set("qty")} aria-label={`Quantity ${n}`} placeholder="e.g. 10 kg" maxLength={30} className={field} />
        </label>
        <label className="grid gap-1 max-md:order-last max-md:col-span-2">
          <span className={small}>Source</span>
          <input value={line.source} onChange={set("source")} aria-label={`Source ${n}`} placeholder="Optional" list={sourcesId} maxLength={60} className={field} />
        </label>
        <label className="grid gap-1">
          <span className={small}>Price £</span>
          <input
            value={line.price}
            onChange={set("price")}
            onKeyDown={(event) => {
              if (event.key === "Enter" && isLast) {
                event.preventDefault();
                onEnterLast();
              }
            }}
            aria-label={`Price ${n} in pounds`}
            aria-invalid={isBad || undefined}
            inputMode="decimal"
            placeholder="Optional"
            className={`${field} text-right tabular-nums ${isBad ? "ring-2 ring-flame-light" : ""}`}
          />
        </label>
      </div>
    </li>
  );
}

/**
 * Write a sheet: items, where from and what they cost. Saving keeps it;
 * Download PDF saves too, then makes the file.
 * `onSave(draft)` resolves with the saved sheet; `onDownload(sheet)` makes the PDF.
 */
export default function SheetEditor({ initial, sources, onSave, onDownload, onClose }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // "save" | "pdf"
  const [savedNote, setSavedNote] = useState(null);
  const listRef = useRef(null);
  const totals = liveTotals(draft);

  const setLine = (id, next) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? next : l)) }));
  const removeLine = (id) => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));
  const addLine = () => {
    if (draft.lines.length >= MAX_LINES) return setError(`Up to ${MAX_LINES} items on one sheet.`);
    setDraft((d) => ({ ...d, lines: [...d.lines, newLine()] }));
    // Focus the new line's item once it is drawn.
    requestAnimationFrame(() => listRef.current?.querySelector("li:last-child input")?.focus());
  };

  const run = async (kind) => {
    if (busy) return;
    setBusy(kind);
    setSavedNote(null);
    try {
      const sheet = await onSave(draft);
      setDraft((d) => ({ ...d, id: sheet.id }));
      if (kind === "pdf") await onDownload(sheet);
      setSavedNote(kind === "pdf" ? "Saved, and the PDF is downloading." : "Saved.");
      setError(null);
    } catch (err) {
      setError(err.message || "That did not work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const sourcesId = "expense-sources";
  return (
    // Enter in a field must not make a PDF: only the buttons act.
    <form
      onSubmit={(event) => event.preventDefault()}
      aria-label={draft.id ? "Edit expense sheet" : "New expense sheet"}
      className="grid gap-4 rounded-[22px] bg-roast-900 p-4 ring-1 ring-cream/10 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-[18px] font-black uppercase">{draft.id ? "Edit sheet" : "New sheet"}</h2>
        <button type="button" onClick={onClose} className="press h-10 rounded-xl px-3.5 text-[13.5px] font-semibold text-cream/75 ring-1 ring-cream/15 hover:bg-cream/5">
          Close
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="grid gap-1.5 text-[13px] font-semibold">
          Title <span className="sr-only">(optional)</span>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Weekly stock order" maxLength={80} className={field} />
        </label>
        <label className="grid gap-1.5 text-[13px] font-semibold">
          Date
          <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required className={`${field} [color-scheme:dark]`} />
        </label>
      </div>

      <div className="grid gap-2">
        <div aria-hidden="true" className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_2.75rem] gap-2 px-1 text-[12px] font-bold uppercase tracking-[0.1em] text-cream/55 md:grid">
          <span>Item</span>
          <span>Qty</span>
          <span>Source</span>
          <span className="text-right">Price £</span>
          <span />
        </div>
        <ol ref={listRef} className="grid gap-2" aria-label="Items">
          {draft.lines.map((line, i) => (
            <LineRow
              key={line.id}
              line={line}
              index={i}
              onChange={(next) => setLine(line.id, next)}
              onRemove={() => removeLine(line.id)}
              onEnterLast={addLine}
              isLast={i === draft.lines.length - 1}
              canRemove={draft.lines.length > 1}
              sourcesId={sourcesId}
            />
          ))}
        </ol>
        <datalist id={sourcesId}>
          {sources.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="button" onClick={addLine} className="press flex h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-cream/25 text-[14px] font-semibold text-cream hover:bg-cream/5">
          <Plus className="size-4" aria-hidden="true" />
          Add item
        </button>
      </div>

      <label className="grid gap-1.5 text-[13px] font-semibold">
        Note <span className="font-normal text-cream/55">(optional, printed at the bottom)</span>
        <textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} rows={2} maxLength={500} className={`${field} h-auto resize-none py-2.5`} />
      </label>

      <section aria-label="Total" className="grid gap-2 rounded-2xl bg-roast-950 p-4 ring-1 ring-cream/10">
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-[13.5px] text-cream/70">
            {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"}
            {totals.unpricedCount > 0 && ` · ${totals.unpricedCount} without a price`}
          </span>
          <span className="font-display text-[26px] font-black tabular-nums leading-none">{formatPrice(totals.totalPence)}</span>
        </p>
        {totals.bySource.length > 1 && (
          <ul className="grid gap-1 border-t border-cream/10 pt-2 text-[13px] text-cream/75">
            {totals.bySource.map((s) => (
              <li key={s.source} className="flex justify-between gap-3">
                <span className="truncate">{s.source}</span>
                <span className="shrink-0 tabular-nums">{formatPrice(s.pence)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div role="status" aria-live="polite" className="min-h-0 empty:hidden">
        {error && <p className="rounded-xl bg-flex/20 px-4 py-2.5 text-[13px] font-semibold text-flame-light">{error}</p>}
        {!error && savedNote && <p className="text-[13px] font-semibold text-[#8fe07f]">{savedNote}</p>}
      </div>

      <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
        <button
          type="button"
          onClick={() => run("save")}
          disabled={Boolean(busy)}
          className="press flex h-12 items-center justify-center gap-1.5 rounded-xl px-5 text-[14.5px] font-semibold ring-1 ring-cream/20 hover:bg-cream/5 disabled:opacity-60"
        >
          <Save className="size-4" aria-hidden="true" />
          {busy === "save" ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => run("pdf")} disabled={Boolean(busy)} className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-flex text-[15px] font-bold text-white hover:bg-flex-deep disabled:opacity-60">
          <Download className="size-5" aria-hidden="true" />
          {busy === "pdf" ? "Making the PDF…" : "Download PDF"}
        </button>
      </div>
    </form>
  );
}
