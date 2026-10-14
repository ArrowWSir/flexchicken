"use client";
import { EMPTY_PRINTER } from "../lib/receiptPrinter";
import { IS_CLOUD } from "../lib/store";
import { useRepoValue, useSettings } from "./useShop";

const readPrinter = (repo) => repo.getPrinter();

/** The network receipt printer's queue and when it last checked in. */
export function usePrinter() {
  return useRepoValue("printer", readPrinter, EMPTY_PRINTER);
}

/**
 * True when receipts go to the network printer rather than this screen's
 * print dialog. Only the website's database can talk to that printer.
 */
export function useIsNetworkPrinter() {
  const settings = useSettings();
  return IS_CLOUD && settings.receiptPrinter === "network";
}
