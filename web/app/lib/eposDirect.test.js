import { describe, expect, test, vi } from "vitest";
import { PrinterUnreachable, STATUS_CHECK, eposEnvelope, sendToEpson, serviceUrl } from "./eposDirect";

const ANSWER =
  '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><response success="true" code="" status="251658262" battery="0" xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"/></s:Body></s:Envelope>';
const DOC = '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><text>Hi&#10;</text></epos-print>';

// A fetch that answers each address in turn from `plan`: a body to answer
// with, or an error to throw (the browser refusing).
function fakeFetch(plan) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    const step = plan[calls.length - 1];
    if (step instanceof Error) throw step;
    return { ok: true, text: async () => step };
  };
  return { fetcher, calls };
}

describe("eposEnvelope", () => {
  test("wraps the document in the SOAP body the printer's service takes", () => {
    expect(eposEnvelope(DOC)).toBe(
      `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${DOC}</s:Body></s:Envelope>`
    );
  });

  test("the status check prints nothing", () => {
    expect(STATUS_CHECK).toBe('<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"></epos-print>');
  });
});

test("serviceUrl addresses the printer's own paper unit", () => {
  expect(serviceUrl("https", "192.168.1.172")).toBe("https://192.168.1.172/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000");
});

describe("sendToEpson", () => {
  test("posts to the printer over https and returns its answer", async () => {
    const { fetcher, calls } = fakeFetch([ANSWER]);
    await expect(sendToEpson("192.168.1.172", DOC, { fetcher })).resolves.toBe(ANSWER);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://192.168.1.172/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000");
    expect(calls[0].init).toMatchObject({ method: "POST", body: eposEnvelope(DOC), targetAddressSpace: "local" });
    expect(calls[0].init.headers).toMatchObject({ "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' });
  });

  test("tries plain http when https is refused (the printer's certificate not yet trusted)", async () => {
    const { fetcher, calls } = fakeFetch([new TypeError("Failed to fetch"), ANSWER]);
    await expect(sendToEpson("192.168.1.172", DOC, { fetcher })).resolves.toBe(ANSWER);
    expect(calls.map((c) => c.url.split("/")[0])).toEqual(["https:", "http:"]);
    expect(calls[1].init.targetAddressSpace).toBe("local");
  });

  test("is unreachable when neither gets through", async () => {
    const { fetcher } = fakeFetch([new TypeError("Failed to fetch"), new TypeError("Failed to fetch")]);
    await expect(sendToEpson("192.168.1.172", DOC, { fetcher })).rejects.toMatchObject({ name: "PrinterUnreachable", isUnsure: false });
  });

  test("does not send again over http when https answered with something that is not the printer's", async () => {
    const { fetcher, calls } = fakeFetch(["<html>router login</html>", ANSWER]);
    await expect(sendToEpson("192.168.1.172", DOC, { fetcher })).rejects.toMatchObject({ name: "PrinterUnreachable", isUnsure: true });
    expect(calls).toHaveLength(1);
  });

  test("a printer that never answers is unreachable, and is not sent the receipt a second time", async () => {
    vi.useFakeTimers();
    try {
      const calls = [];
      const fetcher = (url, init) => {
        calls.push(url);
        return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      };
      const sent = sendToEpson("192.168.1.172", DOC, { fetcher });
      const settled = expect(sent).rejects.toMatchObject({ name: "PrinterUnreachable", isUnsure: true });
      await vi.advanceTimersByTimeAsync(15_000);
      await settled;
      expect(calls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
