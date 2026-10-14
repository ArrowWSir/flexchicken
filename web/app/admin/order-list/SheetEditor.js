"use client";
import { useRef, useState } from "react";
import { Eye, Plus, Save, X } from "lucide-react";
import { MAX_LINES, todayIso } from "../../lib/expenses";
import { field } from "../staff/StaffRow";

const START_LINES = 3;
let lineSeq = 0;
const newLine = () => ({ id: `ln_${Date.now().toString(36)}${(lineSeq += 1)}`, item: "", qty: "" });

export const emptyDraft = () => ({ id: null, title: "", date: todayIso(), note: "", lines: Array.from({ length: START_LINES }, newLine) });

/** A saved list as the editor holds it. */
export const draftOf = (sheet) => ({
  id: sheet.id,
  title: sheet.title,
  date: sheet.date,
  note: sheet.note,
  lines: sheet.lines.map((l) => ({ id: l.id, item: l.item, qty: l.qty })),
});

function LineRow({ line, index, onChange, onRemove, onEnterLast, isLast, canRemove }) {
  const set = (key) => (event) => onChange({ ...line, [key]: event.target.value });
  const n = index + 1;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,6.5rem)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_auto]">
      <input value={line.item} onChange={set("item")} aria-label={`Item ${n}`} placeholder="e.g. Chicken wings" maxLength={80} className={field} />
      <input
        value={line.qty}
        onChange={set("qty")}
        onKeyDown={(event) => {
          if (event.key === "Enter" && isLast) {
            event.preventDefault();
            onEnterLast();
          }
        }}
        aria-label={`Quantity ${n}`}
        placeholder="e.g. 10 kg"
        maxLength={30}
        className={field}
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove item ${n}`}
        className="press flex size-11 items-center justify-center rounded-xl text-cream/60 hover:bg-flex/25 hover:text-cream disabled:opacity-30"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Write an order list: what to buy and how much. Saving keeps it; Preview
 * saves too, then shows the PDF before it is downloaded.
 * `onSave(draft)` resolves with the saved list; `onPreview(sheet)` opens the preview.
 */
export default function SheetEditor({ initial, onSave, onPreview, onClose }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // "save" | "preview"
  const [savedNote, setSavedNote] = useState(null);
  const listRef = useRef(null);
  const itemCount = draft.lines.filter((l) => l.item.trim()).length;

  const setLine = (id, next) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? next : l)) }));
  const removeLine = (id) => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));
  const addLine = () => {
    if (draft.lines.length >= MAX_LINES) return setError(`Up to ${MAX_LINES} items on one list.`);
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
      setSavedNote("Saved.");
      setError(null);
      if (kind === "preview") onPreview(sheet);
    } catch (err) {
      setError(err.message || "That did not work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    // Enter in a field must not save: only the buttons act.
    <form
      onSubmit={(event) => event.preventDefault()}
      aria-label={draft.id ? "Edit order list" : "New order list"}
      className="grid gap-4 rounded-[22px] bg-roast-900 p-4 ring-1 ring-cream/10 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-[18px] font-black uppercase">{draft.id ? "Edit list" : "New list"}</h2>
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
        <div aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_minmax(0,6.5rem)_2.75rem] gap-2 px-1 text-[12px] font-bold uppercase tracking-[0.1em] text-cream/55 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_2.75rem]">
          <span>Item</span>
          <span>Qty</span>
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
            />
          ))}
        </ol>
        <button type="button" onClick={addLine} className="press flex h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-cream/25 text-[14px] font-semibold text-cream hover:bg-cream/5">
          <Plus className="size-4" aria-hidden="true" />
          Add item
        </button>
      </div>

      <label className="grid gap-1.5 text-[13px] font-semibold">
        Note <span className="font-normal text-cream/55">(optional, printed at the bottom)</span>
        <textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} rows={2} maxLength={500} className={`${field} h-auto resize-none py-2.5`} />
      </label>

      <p className="text-[13.5px] text-cream/70">
        {itemCount} item{itemCount === 1 ? "" : "s"} on this list
      </p>

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
        <button type="button" onClick={() => run("preview")} disabled={Boolean(busy)} className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-flex text-[15px] font-bold text-white hover:bg-flex-deep disabled:opacity-60">
          <Eye className="size-5" aria-hidden="true" />
          {busy === "preview" ? "Saving…" : "Preview & download PDF"}
        </button>
      </div>
    </form>
  );
}
