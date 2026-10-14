// Downloads the customer list as an Excel file. The rows come from
// customerSheet (lib/customers.js, tested); this file only writes and saves.
// write-excel-file loads when the button is pressed. Its "universal" build is
// used because the browser build starts a blob: Web Worker, which the CSP's
// worker-src 'self' blocks.
import { CUSTOMER_COLUMNS, customerList, customerSheet, customersFileName } from "./customers";

/** @returns {Promise<number>} how many customers went in the file */
export async function downloadCustomersXlsx(cards, now = Date.now()) {
  const customers = customerList(cards);
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const blob = await writeExcelFile(customerSheet(customers), { columns: CUSTOMER_COLUMNS, sheet: "Customers" }).toBlob();
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: customersFileName(now) });
  link.click();
  // Revoked on the next tick: Safari can drop the download if it is revoked at once.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return customers.length;
}
