"use client";
import { useEffect, useMemo, useState } from "react";
import { cacheCustomer, loadCustomer, previewStampsFromSearch } from "../lib/card";
import { browserEnv } from "../lib/browserEnv";
import { getRepo } from "../lib/store";
import { useSession } from "./useDevice";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * This device's loyalty card, live. The phone keeps its secret card id (and a
 * cached copy, so the card still shows offline); the register holds the
 * 4-digit code and the stamps staff give at the counter. A signed-in
 * customer's name and email are added to the card so staff can find it.
 */
export default function useLoyaltyCard() {
  const session = useSession();
  const [local, setLocal] = useState(null);
  const [card, setCard] = useState(null);

  useEffect(() => {
    setLocal(loadCustomer(browserEnv()));
  }, []);

  useEffect(() => {
    if (!local) return undefined;
    const repo = getRepo();
    repo.registerCard({ id: local.id, name: session?.name || local.name, email: session?.email ?? "" }).catch(() => {
      // Offline, or storage full: the cached card still shows.
    });
    const refresh = () => {
      const found = repo.getCard(local.id);
      if (found) cacheCustomer(browserEnv(), { ...found, shortCode: found.code });
      setCard(found);
    };
    refresh();
    return repo.subscribe("cards", refresh);
  }, [local, session?.name, session?.email]);

  return useMemo(() => {
    if (!local) return null;
    const merged = card ? { ...local, name: card.name || local.name, stamps: card.stamps, shortCode: card.code } : local;
    const preview = IS_PRODUCTION ? null : previewStampsFromSearch(window.location.search);
    return preview === null ? merged : { ...merged, stamps: preview };
  }, [local, card]);
}
