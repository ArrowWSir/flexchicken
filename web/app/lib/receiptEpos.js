// The till receipt in Epson's ePOS-Print XML, for the network printer (an
// Epson TM-m30II/III on Server Direct Print, server/printQueue.js). Same
// receipt as the page in receipt.js, laid out in the printer's own text:
// 80 mm paper is 48 characters of Font A, double width halves that.
//
// Everything a customer typed goes through eposText, so a note can never
// become printer markup.
import { formatTime } from "./receipt";

export const LINE_CHARS = 48;
const WIDE_CHARS = LINE_CHARS / 2;
const RULE = "-".repeat(LINE_CHARS);
const CHOICE_INDENT = "  - ";
// QR module size in dots: a stamp link prints about 33 mm square.
const QR_MODULE_DOTS = 8;
const EPOS_NS = "http://www.epson-pos.com/schemas/2011/03/epos-print";

// Marks phones type that the printer's character set does not have.
const PLAIN = { "−": "-", "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", " ": " " };
const XML = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

/** Text made safe to put inside the printer's XML. */
export function eposText(value) {
  return String(value ?? "")
    .replace(/[−–—‘’“”… ]/g, (ch) => PLAIN[ch])
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/[&<>"']/g, (ch) => XML[ch]);
}

/** Words wrapped to `width` characters; a word longer than a line is cut. */
export function wrapText(value, width) {
  const lines = [];
  let line = "";
  for (const word of String(value ?? "").split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (rest.length > width) {
      if (line) lines.push(line);
      lines.push(rest.slice(0, width));
      line = "";
      rest = rest.slice(width);
    }
    if (!rest) continue;
    if (!line) line = rest;
    else if (line.length + 1 + rest.length <= width) line = `${line} ${rest}`;
    else {
      lines.push(line);
      line = rest;
    }
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

/** `left` and `right` on one line of `width`, the left side wrapping beneath. */
export function rowText(left, right, width = LINE_CHARS) {
  const [first, ...rest] = wrapText(left, Math.max(1, width - right.length - 1));
  return [`${first}${" ".repeat(Math.max(1, width - first.length - right.length))}${right}`, ...rest].join("\n");
}

const wrapped = (value, width = LINE_CHARS, indent = "") =>
  wrapText(value, width - indent.length).map((l) => indent + l).join("\n");

// Printer instructions. `line` prints text and a new line.
const style = (attrs) => `<text ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`;
const line = (value = "") => `<text>${eposText(value)}&#10;</text>`;
const NORMAL = style({ width: 1, height: 1, em: "false", reverse: "false" });
const center = style({ align: "center" });
const left = style({ align: "left" });
const bold = style({ em: "true" });

const document = (body) => `<epos-print xmlns="${EPOS_NS}">${style({ lang: "en", smooth: "true" })}${body}<feed line="3"/><cut type="feed"/></epos-print>`;

function stampBlock(stampUrl) {
  if (!stampUrl) return "";
  return [
    line(RULE),
    center,
    bold,
    line("SCAN FOR YOUR FLEX STAMP"),
    NORMAL,
    `<symbol type="qrcode_model_2" level="level_m" width="${QR_MODULE_DOTS}" size="0">${eposText(stampUrl)}</symbol>`,
    "<feed/>",
    line("One stamp per receipt, within 14 days"),
    left,
  ].join("");
}

/**
 * The receipt from buildReceipt as the inside of an ePOS-Print document.
 * `stampUrl`: the receipt's one-time stamp link, printed as a QR.
 */
export function receiptEpos(receipt, { stampUrl = null } = {}) {
  const { shop, customer } = receipt;
  const items = receipt.lines.map(
    (l) => bold + line(rowText(`${l.qty} x ${l.name}`, l.price)) + NORMAL + l.choices.map((c) => line(wrapped(c, LINE_CHARS, CHOICE_INDENT))).join("")
  );
  return document(
    [
      center,
      bold,
      style({ width: 2, height: 2 }),
      line(wrapped(shop.name, WIDE_CHARS)),
      NORMAL,
      line(shop.address),
      line(shop.phone),
      left,
      line(RULE),
      center,
      bold,
      style({ width: 3, height: 3 }),
      line(receipt.number),
      style({ width: 2, height: 1, reverse: "true" }),
      line(` ${receipt.mode} `),
      NORMAL,
      left,
      line(rowText("Placed", receipt.placed)),
      line(rowText("Accepted", receipt.printed)),
      line(RULE),
      bold,
      line(wrapped(customer.name)),
      NORMAL,
      customer.phone ? line(customer.phone) : "",
      customer.address ? line(wrapped(customer.address)) : "",
      line(RULE),
      ...items,
      receipt.note ? bold + line(wrapped(`NOTE: ${receipt.note}`)) + NORMAL : "",
      line(RULE),
      ...receipt.totals.map(([label, value]) => line(rowText(label, value))),
      bold,
      style({ width: 2, height: 2 }),
      line(rowText("TOTAL", receipt.total, WIDE_CHARS)),
      NORMAL,
      center,
      bold,
      line(receipt.payment),
      NORMAL,
      left,
      stampBlock(stampUrl),
      line(RULE),
      center,
      line(wrapped(`Thank you for ordering with ${shop.name}`)),
    ].join("")
  );
}

/** A short slip that proves the printer and the website talk to each other. */
export function testReceiptEpos(printedAt) {
  return document(
    [
      center,
      bold,
      style({ width: 2, height: 2 }),
      line("PRINTER TEST"),
      NORMAL,
      line(`Printed ${formatTime(printedAt)}`),
      line("Accepted orders will print here."),
    ].join("")
  );
}
