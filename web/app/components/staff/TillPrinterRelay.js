"use client";
import { useTillPrinterRelay } from "../../hooks/useTillPrinterRelay";

/** Sends waiting receipts to the shop's printer, on the till only. Renders nothing. */
export default function TillPrinterRelay() {
  useTillPrinterRelay();
  return null;
}
