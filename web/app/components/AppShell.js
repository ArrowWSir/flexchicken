"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check } from "lucide-react";
import useLoyaltyCard from "../hooks/useLoyaltyCard";
import CartProvider, { useCart } from "./cart/CartProvider";
import CartSheet from "./cart/CartSheet";
import OptionsSheet from "./cart/OptionsSheet";
import FlyToBox from "./cart/FlyToBox";
import Header from "./Header";
import LoyaltyCard from "./card/LoyaltyCard";
import EmberField from "./EmberField";
import PlateBackdrop from "./PlateBackdrop";
import OfferStrip from "./offers/OfferStrip";

const TOAST_MS = 2200;

// "Added 2 × Hot Honey Burger Meal": a quiet confirmation above the fold of
// the thumb, so the visitor knows the Box filled without being sent anywhere.
function AddedToast() {
  const { lastAdded, setIsCartOpen } = useCart();
  const [visible, setVisible] = useState(null);

  useEffect(() => {
    if (!lastAdded) return undefined;
    setVisible(lastAdded);
    const timer = setTimeout(() => setVisible(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [lastAdded]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {visible && (
          <motion.button
            key={visible.at}
            type="button"
            onClick={() => setIsCartOpen(true)}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="on-dark pointer-events-auto flex items-center gap-2.5 rounded-full bg-roast-800 py-2.5 pl-2.5 pr-4 text-[13.5px] font-medium text-cream shadow-[0_18px_36px_-16px_rgb(45_28_21/0.9)]"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-flex">
              <Check className="size-4 text-white" strokeWidth={3} aria-hidden="true" />
            </span>
            Added {visible.qty} × {visible.name}
            <span className="font-semibold text-flame-light">View Box</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AppShell({ children, withCard = true }) {
  const customer = useLoyaltyCard();
  return (
    <CartProvider>
      <PlateBackdrop />
      <EmberField />
      <Header />
      <main className="page-frame relative z-[1]">
        <div className="page-gutter pt-8 sm:pt-12">
          {withCard ? (
            <>
              <LoyaltyCard customer={customer} />
              <OfferStrip />
            </>
          ) : (
            // Sub-pages (account, checkout, tracking) always offer a way home.
            <a
              href="/#menu"
              className="press mb-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-ground-raised pl-3 pr-4 text-[13px] font-semibold text-ink ring-1 ring-line hover:bg-surface"
            >
              <ArrowLeft className="size-4" strokeWidth={2.2} aria-hidden="true" />
              Back to menu
            </a>
          )}
          {children}
        </div>
      </main>
      <CartSheet />
      <OptionsSheet />
      <AddedToast />
      <FlyToBox />
    </CartProvider>
  );
}
