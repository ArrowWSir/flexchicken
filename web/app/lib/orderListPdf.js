// Draws an order list as an A4 PDF. The layout's content comes from
// pdfContent (lib/expenses.js, tested); this file only paints it. jsPDF loads
// when a preview opens, so the admin's other pages never carry it.
//
// The PDF is made before the owner taps Download, and the tap saves it at
// once: phones (Safari above all) refuse a download that starts after the
// tap has finished waiting on something.
import { BRAND } from "./brand";
import { pdfContent } from "./expenses";

const LOGO = "/brand/logo-full.png";
const LOGO_ASPECT = 1227 / 2173; // logo-full.png's own height / width: never stretched
const PAGE_MARGIN = 16; // mm
const LOGO_WIDTH = 38;
const REVOKE_AFTER_MS = 60_000; // long enough for a slow phone to start saving
// The site's palette (globals.css).
const INK = [36, 22, 15];
const MUTED = [92, 70, 54];
const FLEX = [217, 43, 45];
const ROAST = [45, 28, 21];
const PAPER = [251, 245, 236];
const LINE = [201, 173, 136];

async function logoDataUrl() {
  const response = await fetch(LOGO);
  if (!response.ok) throw new Error("The logo could not be loaded.");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The logo could not be read."));
    reader.readAsDataURL(blob);
  });
}

export const madeAt = (at) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(at);

function header(doc, content, logo) {
  const width = doc.internal.pageSize.getWidth();
  // The logo is optional: a PDF without it is still the owner's list.
  if (logo) doc.addImage(logo, "PNG", PAGE_MARGIN, PAGE_MARGIN, LOGO_WIDTH, LOGO_WIDTH * LOGO_ASPECT);
  const right = width - PAGE_MARGIN;
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...FLEX);
  doc.text("ORDER LIST", right, PAGE_MARGIN + 4, { align: "right" });
  doc.setFontSize(18).setTextColor(...INK);
  doc.text(doc.splitTextToSize(content.heading, 110), right, PAGE_MARGIN + 12, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  doc.text(content.date, right, PAGE_MARGIN + 19, { align: "right" });
  const ruleY = PAGE_MARGIN + LOGO_WIDTH * LOGO_ASPECT + 5;
  doc.setDrawColor(...FLEX).setLineWidth(0.8).line(PAGE_MARGIN, ruleY, right, ruleY);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  doc.text(`${content.itemCount} item${content.itemCount === 1 ? "" : "s"}`, PAGE_MARGIN, ruleY + 8);
  return ruleY + 13;
}

function footer(doc, printedAt) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const y = doc.internal.pageSize.getHeight() - 9;
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(`${BRAND.legalName} · ${BRAND.address.short} · made ${madeAt(printedAt)}`, PAGE_MARGIN, y);
    doc.text(`Page ${page} of ${pages}`, width - PAGE_MARGIN, y, { align: "right" });
  }
}

/**
 * Builds the list's PDF without saving it.
 * @returns {Promise<{ blob: Blob, fileName: string }>}
 */
export async function buildOrderListPdf(sheet, printedAt = Date.now()) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const content = pdfContent(sheet);
  const logo = await logoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: `${content.heading} · ${content.date}`, author: BRAND.legalName, creator: BRAND.name });

  autoTable(doc, {
    theme: "plain",
    startY: header(doc, content, logo),
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    styles: { font: "helvetica", fontSize: 11, textColor: INK, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, lineColor: LINE },
    headStyles: { fillColor: ROAST, textColor: [255, 246, 234], fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: PAPER },
    head: [content.columns],
    body: content.rows,
    columnStyles: { 0: { cellWidth: 10, textColor: MUTED }, 2: { cellWidth: 40, halign: "right" } },
    didParseCell: ({ section, column, cell }) => {
      if (section === "head" && column.index === 2) cell.styles.halign = "right";
    },
  });

  if (content.note) {
    const y = doc.lastAutoTable.finalY + 4;
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK).text("Note", PAGE_MARGIN, y + 8);
    const width = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
    doc.setFont("helvetica", "normal").setTextColor(...MUTED).text(doc.splitTextToSize(content.note, width), PAGE_MARGIN, y + 14);
  }

  footer(doc, printedAt);
  return { blob: doc.output("blob"), fileName: content.fileName };
}

/** Saves a ready PDF. Call it straight from the tap, with nothing awaited first. */
export function savePdf({ blob, fileName }) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName, rel: "noopener" });
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** The PDF as a file the phone's share sheet takes ("Save to Files", WhatsApp, email), or null. */
export function shareableFile({ blob, fileName }) {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function" || typeof File !== "function") return null;
  const file = new File([blob], fileName, { type: "application/pdf" });
  return navigator.canShare({ files: [file] }) ? file : null;
}
