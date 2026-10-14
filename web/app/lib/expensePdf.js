// Draws an expense sheet as an A4 PDF and downloads it. The layout's content
// comes from pdfContent (lib/expenses.js, tested); this file only paints it.
// jsPDF loads when the button is pressed, so the admin's other pages never
// carry it.
import { BRAND } from "./brand";
import { pdfContent } from "./expenses";

const LOGO = "/brand/logo-full.png";
const LOGO_ASPECT = 1227 / 2173; // logo-full.png's own height / width: never stretched
const PAGE_MARGIN = 16; // mm
const LOGO_WIDTH = 38;
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

const generatedAt = (at) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(at);

function header(doc, content, logo) {
  const width = doc.internal.pageSize.getWidth();
  // The logo is optional: a PDF without it is still the owner's record.
  if (logo) doc.addImage(logo, "PNG", PAGE_MARGIN, PAGE_MARGIN, LOGO_WIDTH, LOGO_WIDTH * LOGO_ASPECT);
  const right = width - PAGE_MARGIN;
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...FLEX);
  doc.text("EXPENSES", right, PAGE_MARGIN + 4, { align: "right" });
  doc.setFontSize(18).setTextColor(...INK);
  doc.text(doc.splitTextToSize(content.heading, 110), right, PAGE_MARGIN + 12, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  doc.text(content.date, right, PAGE_MARGIN + 19, { align: "right" });
  const ruleY = PAGE_MARGIN + LOGO_WIDTH * LOGO_ASPECT + 5;
  doc.setDrawColor(...FLEX).setLineWidth(0.8).line(PAGE_MARGIN, ruleY, right, ruleY);
  return ruleY + 8;
}

function summary(doc, content, y) {
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  doc.text(`${content.itemCount} item${content.itemCount === 1 ? "" : "s"}`, PAGE_MARGIN, y);
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...INK);
  doc.text(`Total ${content.total}`, doc.internal.pageSize.getWidth() - PAGE_MARGIN, y, { align: "right" });
  return y + 5;
}

const tableStyle = {
  theme: "plain",
  margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: { top: 2.6, bottom: 2.6, left: 3, right: 3 }, lineColor: LINE },
  headStyles: { fillColor: ROAST, textColor: [255, 246, 234], fontStyle: "bold", fontSize: 9 },
  alternateRowStyles: { fillColor: PAPER },
  footStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: "bold", fontSize: 11 },
};

function footer(doc, printedAt) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const y = doc.internal.pageSize.getHeight() - 9;
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    doc.text(`${BRAND.legalName} · ${BRAND.address.short} · made ${generatedAt(printedAt)}`, PAGE_MARGIN, y);
    doc.text(`Page ${page} of ${pages}`, width - PAGE_MARGIN, y, { align: "right" });
  }
}

/** Builds the sheet's PDF and starts the download. Resolves with the file name. */
export async function downloadExpensePdf(sheet, printedAt = Date.now()) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const content = pdfContent(sheet);
  const logo = await logoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: `${content.heading} · ${content.date}`, author: BRAND.legalName, creator: BRAND.name });

  let y = summary(doc, content, header(doc, content, logo));
  const priceColumn = content.columns.length - 1;
  autoTable(doc, {
    ...tableStyle,
    startY: y,
    head: [content.columns],
    body: content.rows,
    foot: [content.columns.map((_, i) => (i === priceColumn ? content.total : i === priceColumn - 1 ? "Total" : ""))],
    columnStyles: { 0: { cellWidth: 9, textColor: MUTED }, [priceColumn]: { halign: "right", cellWidth: 26 } },
    // Prices, their heading and the total line up on the right.
    didParseCell: ({ section, column, cell }) => {
      if (column.index === priceColumn || (section === "foot" && column.index === priceColumn - 1)) cell.styles.halign = "right";
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  if (content.unpricedNote) {
    doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(...MUTED).text(content.unpricedNote, PAGE_MARGIN, y + 2);
    y += 6;
  }

  if (content.bySource.length) {
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK).text("By source", PAGE_MARGIN, y + 8);
    autoTable(doc, {
      ...tableStyle,
      startY: y + 11,
      head: [["Source", "Items", "Spent"]],
      body: content.bySource,
      columnStyles: { 1: { halign: "right", cellWidth: 18 }, 2: { halign: "right", cellWidth: 30 } },
      didParseCell: ({ section, column, cell }) => {
        if (section === "head" && column.index > 0) cell.styles.halign = "right";
      },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  if (content.note) {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK).text("Note", PAGE_MARGIN, y + 8);
    const width = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
    doc.setFont("helvetica", "normal").setTextColor(...MUTED).text(doc.splitTextToSize(content.note, width), PAGE_MARGIN, y + 14);
  }

  footer(doc, printedAt);
  doc.save(content.fileName);
  return content.fileName;
}
