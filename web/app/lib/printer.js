// Sends a receipt to the till's printer. For now this is the browser's own
// print: the receipt page goes to whatever printer is the till's default.
// Run the till's browser in kiosk printing mode (Chrome or Edge started with
// --kiosk-printing) and it prints straight away with no dialog.
//
// When the till deal is settled, its driver (a cloud print API, ESC/POS over
// the network, the payment terminal's printer) replaces sendToPrinter below;
// callers keep calling printReceipt.
import QRCode from "qrcode";
import { buildReceipt, receiptHtml } from "./receipt";

// Long enough for the print dialog or spooler to take the page.
const CLEANUP_AFTER_MS = 60_000;

function sendToPrinter(html) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    const cleanup = () => frame.remove();
    frame.onload = () => {
      try {
        const win = frame.contentWindow;
        win.addEventListener("afterprint", cleanup, { once: true });
        setTimeout(cleanup, CLEANUP_AFTER_MS);
        win.focus();
        win.print();
        resolve();
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

// A receipt without its QR is still a receipt: the kitchen needs the order
// more than the customer needs the stamp code, which staff can give by hand.
async function stampQrSvg(stampUrl) {
  if (!stampUrl) return null;
  try {
    return await QRCode.toString(stampUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}

/**
 * Print the till receipt for an order. `stampUrl` is the receipt's one-time
 * stamp link, printed as a QR. Rejects if the page could not be sent.
 */
export async function printReceipt(order, { stampUrl = null, printedAt = Date.now() } = {}) {
  const qrSvg = await stampQrSvg(stampUrl);
  return sendToPrinter(receiptHtml(buildReceipt(order, printedAt), { qrSvg }));
}
