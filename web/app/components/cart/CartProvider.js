"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EMPTY_CART, addToCart, defaultSelections, loadCart, mergeCart, missingRequired, removeLine, saveCart, setLineQty } from "../../lib/cart";
import { browserEnv } from "../../lib/browserEnv";
import { priceCart } from "../../lib/promotions";
import { usePromotions } from "../../hooks/useShop";

const CartContext = createContext(null);

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>");
  return value;
}

/**
 * Owns the Flex Box for this device. Everything that changes the cart goes
 * through the pure functions in lib/cart, and the result is saved straight away.
 *
 * Adding an item that still needs a decision (a meal's drink, say) opens the
 * options sheet instead; the sheet calls `confirm` with the choices.
 */
export default function CartProvider({ children }) {
  const router = useRouter();
  const [cart, setCart] = useState(EMPTY_CART);
  // False until the saved Box has been read, so pages do not flash "empty".
  const [isReady, setIsReady] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // { item, qty, mode: "add" | "buy" } while the options sheet is open.
  const [pending, setPending] = useState(null);
  const [lastAdded, setLastAdded] = useState(null);
  const promotions = usePromotions();

  useEffect(() => {
    setCart(loadCart(browserEnv().storage));
    setIsReady(true);
  }, []);

  const commit = useCallback((next) => {
    setCart(next);
    saveCart(browserEnv().storage, next);
  }, []);

  const finish = useCallback(
    (item, selections, qty, mode) => {
      commit(addToCart(cart, item, selections, qty));
      setLastAdded({ id: item.id, name: item.name, qty, mode, at: Date.now() });
      if (mode === "buy") router.push("/checkout");
    },
    [cart, commit, router]
  );

  /** Add `qty` of an item; mode "buy" goes straight on to checkout. */
  const request = useCallback(
    (item, qty, mode = "add") => {
      if (item.isSoldOut) return;
      const selections = defaultSelections(item);
      const needsChoice = (item.options ?? []).some((o) => o.choices.length > 1 || !o.isRequired);
      if (needsChoice || missingRequired(item, selections).length) {
        setPending({ item, qty, mode });
        return;
      }
      finish(item, selections, qty, mode);
    },
    [finish]
  );

  const confirm = useCallback(
    (selections, qty) => {
      if (!pending) return;
      finish(pending.item, selections, qty, pending.mode);
      setPending(null);
    },
    [pending, finish]
  );

  /**
   * Everything picked on the full menu (a cart of its own) into the Box at
   * once. That page's own bar confirms it, so no toast or flying dish here.
   */
  const addPicks = useCallback((picks) => commit(mergeCart(cart, picks)), [cart, commit]);

  const value = useMemo(
    () => ({
      cart,
      isReady,
      // Subtotal, the best live offer and what it saves (lib/promotions).
      summary: priceCart(cart, promotions),
      request,
      addPicks,
      confirm,
      pending,
      cancelPending: () => setPending(null),
      setQty: (key, qty) => commit(setLineQty(cart, key, qty)),
      remove: (key) => commit(removeLine(cart, key)),
      clear: () => commit(EMPTY_CART),
      isCartOpen,
      setIsCartOpen,
      lastAdded,
    }),
    [cart, promotions, isReady, request, addPicks, confirm, pending, commit, isCartOpen, lastAdded]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
