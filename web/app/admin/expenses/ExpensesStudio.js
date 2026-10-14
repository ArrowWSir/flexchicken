"use client";
import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { formatPrice } from "../../lib/cart";
import { formatSheetDate, knownSources, sheetTotals, todayIso } from "../../lib/expenses";
import { downloadExpensePdf } from "../../lib/expensePdf";
import { getRepo } from "../../lib/store";
import { useExpenseSheets } from "../../hooks/useShop";
import SheetEditor, { draftOf, emptyDraft } from "./SheetEditor";

function SheetRow({ sheet, onOpen, onDownload, onRemove }) {
  const totals = sheetTotals(sheet);
  const name = sheet.title || "Expenses";
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-roast-900 p-3 ring-1 ring-cream/10">
      <button type="button" onClick={onOpen} className="press min-w-0 flex-1 rounded-xl text-left">
        <span className="line-clamp-2 block text-[14.5px] font-semibold leading-snug">{name}</span>
        <span className="block text-[12.5px] text-cream/60">
          {formatSheetDate(sheet.date)} · {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"}
        </span>
      </button>
      <span className="shrink-0 font-display text-[16px] font-black tabular-nums">{formatPrice(totals.totalPence)}</span>
      <button
        type="button"
        onClick={onDownload}
        aria-label={`Download ${name}, ${formatSheetDate(sheet.date)}, as PDF`}
        className="press flex size-10 shrink-0 items-center justify-center rounded-xl text-cream/75 hover:bg-cream/10 hover:text-cream"
      >
        <Download className="size-4" aria-hidden="true" />
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
 * The owner's expense sheets: list what was bought, where from and for how
 * much, and download it as a PDF that adds it all up.
 */
export default function ExpensesStudio() {
  const sheets = useExpenseSheets();
  const sources = useMemo(() => knownSources(sheets), [sheets]);
  const [editing, setEditing] = useState(null); // a draft, or null
  const [error, setError] = useState(null);

  // Rejects with what to fix; the editor shows it.
  const save = (draft) => getRepo().saveExpenseSheet({ ...draft, id: draft.id ?? undefined });
  const act = async (fn) => {
    try {
      await fn();
      setError(null);
    } catch (err) {
      setError(err.message || "That did not work. Try again.");
    }
  };
  const thisMonth = todayIso().slice(0, 7);
  const monthTotal = sheets
    .filter((s) => s.date.slice(0, 7) === thisMonth)
    .reduce((sum, s) => sum + sheetTotals(s).totalPence, 0);

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-black uppercase leading-none">Expenses</h1>
          <p className="mt-1 max-w-[60ch] text-[13px] text-cream/60">
            List what you bought, where from and what it cost. One tap makes a PDF that adds it all up.
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(emptyDraft())} className="press flex h-11 items-center gap-1.5 rounded-xl bg-flame-light px-4 text-[14px] font-bold text-roast-950">
            <Plus className="size-4" aria-hidden="true" />
            New sheet
          </button>
        )}
      </div>

      {editing && (
        <SheetEditor
          key={editing.id ?? "new"}
          initial={editing}
          sources={sources}
          onSave={save}
          onDownload={(sheet) => downloadExpensePdf(sheet)}
          onClose={() => setEditing(null)}
        />
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-flex/20 px-4 py-2.5 text-[13px] font-semibold text-flame-light">
          {error}
        </p>
      )}

      <section aria-labelledby="sheets-heading" className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="sheets-heading" className="font-display text-[18px] font-black uppercase">
            Saved sheets
          </h2>
          {monthTotal > 0 && <p className="text-[13px] font-semibold text-cream/60">This month {formatPrice(monthTotal)}</p>}
        </div>
        {sheets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-cream/15 px-4 py-6 text-center text-[13.5px] text-cream/55">No sheets yet. Tap New sheet to start one.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {sheets.map((sheet) => (
              <SheetRow
                key={sheet.id}
                sheet={sheet}
                onOpen={() => setEditing(draftOf(sheet))}
                onDownload={() => act(() => downloadExpensePdf(sheet))}
                onRemove={() =>
                  window.confirm(`Delete "${sheet.title || "Expenses"}" from ${formatSheetDate(sheet.date)}? This cannot be undone.`) &&
                  act(async () => {
                    await getRepo().removeExpenseSheet(sheet.id);
                    if (editing?.id === sheet.id) setEditing(null);
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
