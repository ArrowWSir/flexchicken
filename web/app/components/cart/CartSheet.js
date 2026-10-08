"use client";
import { Drawer } from "vaul";
import NumberFlow from "@number-flow/react";
import { ShoppingBag, Trash2 } from "lucide-react";
import { formatPrice } from "../../lib/cart";
import { useCart } from "./CartProvider";
import QtyStepper from "../ui/QtyStepper";
import DeliveryTerms from "../DeliveryTerms";

const GBP = { style: "currency", currency: "GBP" };

export default function CartSheet() {
  const { cart, summary, setQty, remove, isCartOpen, setIsCartOpen } = useCart();
  const isEmpty = cart.lines.length === 0;

  return (
    <Drawer.Root open={isCartOpen} onOpenChange={setIsCartOpen}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-roast-950/45 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-[560px] flex-col rounded-t-[28px] bg-ground outline-none">
          <Drawer.Handle className="mt-3 !w-12 !bg-line" />
          <div className="flex items-end justify-between px-5 pt-4">
            <Drawer.Title className="font-display text-[26px] font-black uppercase leading-none">Your Flex Box</Drawer.Title>
            <Drawer.Description className="text-[12.5px] text-muted">
              {summary.count} item{summary.count === 1 ? "" : "s"}
            </Drawer.Description>
          </div>

          {isEmpty ? (
            <div className="flex flex-col items-center px-5 pb-12 pt-10 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-surface">
                <ShoppingBag className="size-7 text-roast-700" strokeWidth={1.7} aria-hidden="true" />
              </span>
              <p className="mt-4 font-semibold">Your Box is empty</p>
              <p className="mt-1 text-[13.5px] text-muted">Pick a badge, turn the table, and add something tasty.</p>
            </div>
          ) : (
            <>
              <ul className="mt-3 overflow-y-auto px-5">
                {cart.lines.map((line) => (
                  <li key={line.key} className="flex gap-3 border-b border-line py-3.5 last:border-0">
                    <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-surface">
                      {line.image && <img src={line.image} alt="" className="size-[90%] object-contain" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[14px] font-semibold leading-tight">{line.name}</p>
                        <p className="text-[14px] font-semibold">{formatPrice(line.unitPence * line.qty)}</p>
                      </div>
                      {line.choices.length > 0 && (
                        <p className="mt-0.5 text-[12px] leading-snug text-muted">
                          {line.choices.map((c) => c.choice).join(" · ")}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <QtyStepper value={line.qty} onChange={(qty) => setQty(line.key, qty)} label={line.name} size="sm" />
                        <button
                          type="button"
                          onClick={() => remove(line.key)}
                          className="press flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-flex-ink"
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 className="size-4" strokeWidth={2} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-auto border-t border-line bg-ground-raised px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                {summary.promo && (
                  <p className="mb-1.5 flex items-baseline justify-between gap-3 text-[13.5px] font-semibold text-go-deep">
                    <span className="min-w-0 truncate">Offer: {summary.promo.title}</span>
                    <span className="shrink-0">−{formatPrice(summary.discountPence)}</span>
                  </p>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] text-muted">{summary.promo ? "Food total" : "Subtotal"}</span>
                  <span className="font-display text-[24px] font-extrabold">
                    <NumberFlow value={summary.itemsPence / 100} format={GBP} locales="en-GB" />
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-muted">
                  <DeliveryTerms />. Your address is checked at checkout.
                </p>
                <a
                  href="/checkout"
                  onClick={() => setIsCartOpen(false)}
                  className="press mt-3 flex h-13 w-full items-center justify-center rounded-2xl bg-flex py-3.5 text-[15px] font-semibold text-white hover:bg-flex-deep"
                >
                  Go to checkout
                </a>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
