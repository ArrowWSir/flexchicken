// Sends an ePOS-Print document straight to the Epson printer on the shop's
// network, from the till's browser ("till" mode, server/printQueue.js). The
// printer's own web service takes it: POST /cgi-bin/epos/service.cgi, a SOAP
// envelope round the document, and it answers with <response success=..>.
// Epson's ePOS-Print API (TM-m30II: ePOS-Print enabled, device local_printer).
//
// The site is https, so the printer is tried at https first. Its certificate
// is its own, so Chrome only lets that through once someone has opened the
// printer's page on the till and tapped Proceed. Then plain http, which
// Chrome allows to a local address when the fetch says so
// (targetAddressSpace) and the shop has allowed local network access.

const DEVICE_ID = "local_printer";
// The printer gives up on a receipt after this; the till waits a little longer.
const PRINT_TIMEOUT_MS = 10_000;
const FETCH_TIMEOUT_MS = 15_000;
const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const EPOS_NS = "http://www.epson-pos.com/schemas/2011/03/epos-print";

/** An empty document: prints nothing, and the answer says the printer is there. */
export const STATUS_CHECK = `<epos-print xmlns="${EPOS_NS}"></epos-print>`;

/** The SOAP request the printer's web service takes. */
export const eposEnvelope = (document) =>
  `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="${SOAP_NS}"><s:Body>${document}</s:Body></s:Envelope>`;

/** The service address at `address` (an IP) over `scheme`. */
export const serviceUrl = (scheme, address) => `${scheme}://${address}/cgi-bin/epos/service.cgi?devid=${DEVICE_ID}&timeout=${PRINT_TIMEOUT_MS}`;

/** The printer did not answer. `isUnsure`: the receipt may have reached it all the same. */
export class PrinterUnreachable extends Error {
  constructor({ isUnsure = false } = {}) {
    super("The till could not reach the printer.");
    this.name = "PrinterUnreachable";
    this.isUnsure = isUnsure;
  }
}

// The printer's answer, "none" when nothing reached it, or "unsure" when it
// may have: the till then stops, rather than risk a second copy.
async function post(url, body, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      method: "POST",
      // The headers Epson's own SDK sends. They make the browser ask the
      // printer first (CORS), so a refused request never reaches the paper.
      headers: { "Content-Type": "text/xml; charset=utf-8", "If-Modified-Since": "Thu, 01 Jan 1970 00:00:00 GMT", SOAPAction: '""' },
      body,
      cache: "no-store",
      signal: controller.signal,
      targetAddressSpace: "local",
    });
    const text = await response.text();
    return /<response\b/.test(text) ? text : "unsure";
  } catch {
    return controller.signal.aborted ? "unsure" : "none";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends `document` to the printer at `address` and returns its answer (the
 * XML holding <response>), or throws PrinterUnreachable.
 */
export async function sendToEpson(address, document, { fetcher = (...args) => fetch(...args) } = {}) {
  const body = eposEnvelope(document);
  const secure = await post(serviceUrl("https", address), body, fetcher);
  if (secure === "unsure") throw new PrinterUnreachable({ isUnsure: true });
  if (secure !== "none") return secure;
  const plain = await post(serviceUrl("http", address), body, fetcher);
  if (plain === "none" || plain === "unsure") throw new PrinterUnreachable({ isUnsure: plain === "unsure" });
  return plain;
}
