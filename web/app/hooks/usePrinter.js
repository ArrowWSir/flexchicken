"use client";
import { EMPTY_PRINTER } from "../lib/receiptPrinter";
import { QUEUED_PRINTERS } from "../lib/settings";
import { IS_CLOUD } from "../lib/store";
import { useRepoValue, useSettings } from "./useShop";

const readPrinter = (repo) => repo.getPrinter();

/** The network receipt printer's queue and when it last checked in. */
export function usePrinter() {
  return useRepoValue("printer", readPrinter, EMPTY_PRINTER);
}

/**
 * True when receipts go to the Epson printer on the shop's network rather
 * than this screen's print dialog: the website queues them, and the printer
 * or the till collects them. Only the website's database keeps that queue.
 */
export function useIsNetworkPrinter() {
  const settings = useSettings();
  return IS_CLOUD && QUEUED_PRINTERS.includes(settings.receiptPrinter);
}

/** True when the till's staff screen sends receipts to the printer. */
export function useIsTillPrinter() {
  const settings = useSettings();
  return IS_CLOUD && settings.receiptPrinter === "till";
}
