"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, Share2, X } from "lucide-react";
import { BRAND } from "../../lib/brand";
import { pdfContent } from "../../lib/expenses";
import { buildOrderListPdf, madeAt, savePdf, shareableFile } from "../../lib/orderListPdf";

// Escape closes, focus moves in on open and back to the button on close, and
// Tab stays inside.
function useDialogFocus(panelRef, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const returnTo = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") return closeRef.current();
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      returnTo?.focus?.();
    };
  }, [panelRef]);
}

// The page as the PDF lays it out: logo, title and date, then item and quantity.
function Paper({ content, printedAt }) {
  return (
    <article aria-label="Order list preview" className="rounded-md bg-white px-[7.6%] pb-6 pt-[7.6%] text-ink shadow-[0_18px_40px_-20px_rgb(0_0_0/0.9)]">
      <header className="flex items-start justify-between gap-4 border-b-[3px] border-flex pb-3">
        <img src="/brand/logo-full.png" alt="Flex Chicken" width={2173} height={1227} className="h-auto w-[34%] max-w-[150px]" />
        <div className="min-w-0 text-right">
          <p className="text-[10px] font-bold tracking-[0.08em] text-flex-ink">ORDER LIST</p>
          <p className="break-words text-[18px] font-bold leading-tight">{content.heading}</p>
          <p className="text-[12px] text-muted">{content.date}</p>
        </div>
      </header>
      <p className="mt-2.5 text-[12px] text-muted">
        {content.itemCount} item{content.itemCount === 1 ? "" : "s"}
      </p>
      <table className="mt-2 w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="bg-roast-800 text-left text-[11px] text-cream">
            <th scope="col" className="w-8 px-2 py-1.5 font-bold">#</th>
            <th scope="col" className="px-2 py-1.5 font-bold">Item</th>
            <th scope="col" className="px-2 py-1.5 text-right font-bold">Qty</th>
          </tr>
        </thead>
        <tbody>
          {content.rows.map(([n, item, qty]) => (
            <tr key={n} className="even:bg-[#fbf5ec]">
              <td className="px-2 py-1.5 align-top text-muted">{n}</td>
              <td className="break-words px-2 py-1.5 align-top">{item}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right align-top">{qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {content.note && (
        <div className="mt-4 text-[12.5px]">
          <p className="font-bold">Note</p>
          <p className="whitespace-pre-wrap break-words text-muted">{content.note}</p>
        </div>
      )}
      <p className="mt-6 text-[10px] text-muted">
        {BRAND.legalName} · {BRAND.address.short} · made {madeAt(printedAt)}
      </p>
    </article>
  );
}

/**
 * See the order list as the PDF will print it, then download, share or open
 * it. The PDF is built as the preview opens, so Download saves at the tap.
 */
export default function PreviewDialog({ sheet, onClose }) {
  const panelRef = useRef(null);
  const [printedAt] = useState(() => Date.now());
  const [pdf, setPdf] = useState(null); // { blob, fileName, url, file }
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const content = pdfContent(sheet);
  useDialogFocus(panelRef, onClose);

  useEffect(() => {
    let isLive = true;
    let url = null;
    buildOrderListPdf(sheet, printedAt).then(
      (built) => {
        if (!isLive) return;
        url = URL.createObjectURL(built.blob);
        setPdf({ ...built, url, file: shareableFile(built) });
      },
      (err) => isLive && setError(`Couldn’t make the PDF: ${err.message}`)
    );
    return () => {
      isLive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [sheet, printedAt]);

  const download = () => {
    try {
      savePdf(pdf);
      setNote(`Downloading ${pdf.fileName}. On a phone, look in Downloads or Files.`);
    } catch (err) {
      setError(`Couldn’t download the PDF: ${err.message}. Try Open PDF instead.`);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ files: [pdf.file], title: content.heading });
    } catch (err) {
      if (err?.name !== "AbortError") setError("Couldn’t share the PDF. Try Download or Open PDF instead.");
    }
  };

  const busy = !pdf && !error;
  const button = "press flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-[14.5px] font-bold disabled:opacity-50";
  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-stretch justify-center sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close preview" tabIndex={-1} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview: ${content.heading}`}
        tabIndex={-1}
        className="on-dark relative flex max-h-dvh w-full max-w-[720px] flex-col bg-roast-950 text-cream outline-none ring-1 ring-cream/10 sm:max-h-[92dvh] sm:rounded-[26px]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-cream/10 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
          <h2 className="font-display text-[18px] font-black uppercase leading-none">Preview</h2>
          <button type="button" onClick={onClose} aria-label="Close preview" className="press flex size-10 items-center justify-center rounded-xl bg-cream/10 hover:bg-cream/15">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-roast-800 p-3 sm:p-5">
          <Paper content={content} printedAt={printedAt} />
        </div>

        <div className="grid gap-2 border-t border-cream/10 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
          <div role="status" aria-live="polite" className="empty:hidden">
            {error && <p className="rounded-xl bg-flex/20 px-3 py-2 text-[13px] font-semibold text-flame-light">{error}</p>}
            {!error && note && <p className="text-[13px] font-semibold text-gold">{note}</p>}
          </div>
          <button type="button" onClick={download} disabled={!pdf} className={`${button} bg-flex text-white hover:bg-flex-deep`}>
            <Download className="size-5" aria-hidden="true" />
            {busy ? "Making the PDF…" : "Download PDF"}
          </button>
          <div className={`grid gap-2 ${pdf?.file ? "grid-cols-2" : "grid-cols-1"}`}>
            {pdf?.file && (
              <button type="button" onClick={share} className={`${button} bg-cream/10 text-cream hover:bg-cream/15`}>
                <Share2 className="size-4" aria-hidden="true" />
                Share or save
              </button>
            )}
            <a
              href={pdf?.url ?? undefined}
              target="_blank"
              rel="noopener"
              aria-disabled={!pdf || undefined}
              onClick={(event) => !pdf && event.preventDefault()}
              className={`${button} bg-cream/10 text-cream hover:bg-cream/15 ${pdf ? "" : "pointer-events-none opacity-50"}`}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Open PDF
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
