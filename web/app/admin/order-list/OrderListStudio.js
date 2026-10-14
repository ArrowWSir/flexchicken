"use client";
import { useState } from "react";
import { Eye, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { DEFAULT_TITLE, formatSheetDate } from "../../lib/expenses";
import { getRepo } from "../../lib/store";
import { useExpenseSheets } from "../../hooks/useShop";
import SheetEditor, { draftOf, emptyDraft } from "./SheetEditor";
import PreviewDialog from "./PreviewDialog";
import ChangeListPin from "./ChangeListPin";

function SheetRow({ sheet, onOpen, onPreview, onRemove }) {
  const name = sheet.title || DEFAULT_TITLE;
  const count = sheet.lines.length;
  return (
    <li className="flex items-center gap-2 rounded-2xl bg-roast-900 p-3 ring-1 ring-cream/10">
      <button type="button" onClick={onOpen} className="press min-w-0 flex-1 rounded-xl text-left">
        <span className="line-clamp-2 block text-[14.5px] font-semibold leading-snug">{name}</span>
        <span className="block text-[12.5px] text-cream/60">
          {formatSheetDate(sheet.date)} · {count} item{count === 1 ? "" : "s"}
        </span>
      </button>
      <button
        type="button"
        onClick={onPreview}
        aria-label={`Preview and download ${name}, ${formatSheetDate(sheet.date)}`}
        className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-cream/10 px-3 text-[13px] font-semibold hover:bg-cream/15"
      >
        <Eye className="size-4" aria-hidden="true" />
        <span className="max-[359px]:sr-only">PDF</span>
      </button>
      <button type="button" onClick={onOpen} aria-label={`Edit ${name}, ${formatSheetDate(sheet.date)}`} className="press flex size-10 shrink-0 items-center justify-center rounded-xl text-cream/75 hover:bg-cream/10 hover:text-cream max-sm:hidden">
        <Pencil className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete ${name}, ${formatSheetDate(sheet.date)}`}
        className="press flex size-10 shrink-0 items-center justify-center rounded-xl text-cream/75 hover:bg-flex/25 hover:text-cream"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * The owner's order lists: what to buy and how much, previewed and
 * downloaded as a PDF for the supplier. Shown once the order list PIN is in.
 */
export default function OrderListStudio({ onLock }) {
  const sheets = useExpenseSheets();
  const [editing, setEditing] = useState(null); // a draft, or null
  const [preview, setPreview] = useState(null); // the list being previewed, or null
  const [error, setError] = useState(null);

  // Rejects with what to fix; the editor shows it.
  const save = (draft) => getRepo().saveExpenseSheet({ ...draft, id: draft.id ?? undefined });
  const remove = async (sheet) => {
    if (!window.confirm(`Delete "${sheet.title || DEFAULT_TITLE}" from ${formatSheetDate(sheet.date)}? This cannot be undone.`)) return;
    try {
      await getRepo().removeExpenseSheet(sheet.id);
      if (editing?.id === sheet.id) setEditing(null);
      setError(null);
    } catch (err) {
      setError(err.message || "That did not work. Try again.");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-black uppercase leading-none">Order list</h1>
          <p className="mt-1 max-w-[60ch] text-[13px] text-cream/60">List what to buy and how much. Preview it, then download the PDF.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onLock} className="press flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-semibold text-cream/75 ring-1 ring-cream/15 hover:bg-cream/5">
            <Lock className="size-4" aria-hidden="true" />
            Lock
          </button>
          {!editing && (
            <button type="button" onClick={() => setEditing(emptyDraft())} className="press flex h-11 items-center gap-1.5 rounded-xl bg-flame-light px-4 text-[14px] font-bold text-roast-950">
              <Plus className="size-4" aria-hidden="true" />
              New list
            </button>
          )}
        </div>
      </div>

      {editing && <SheetEditor key={editing.id ?? "new"} initial={editing} onSave={save} onPreview={setPreview} onClose={() => setEditing(null)} />}

      {error && (
        <p role="alert" className="rounded-xl bg-flex/20 px-4 py-2.5 text-[13px] font-semibold text-flame-light">
          {error}
        </p>
      )}

      <section aria-labelledby="sheets-heading" className="grid gap-2">
        <h2 id="sheets-heading" className="font-display text-[18px] font-black uppercase">
          Saved lists
        </h2>
        {sheets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-cream/15 px-4 py-6 text-center text-[13.5px] text-cream/55">No lists yet. Tap New list to start one.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {sheets.map((sheet) => (
              <SheetRow key={sheet.id} sheet={sheet} onOpen={() => setEditing(draftOf(sheet))} onPreview={() => setPreview(sheet)} onRemove={() => remove(sheet)} />
            ))}
          </ul>
        )}
      </section>

      <ChangeListPin />

      {preview && <PreviewDialog sheet={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
