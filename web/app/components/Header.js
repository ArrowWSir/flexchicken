"use client";
import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { ShoppingBag, UserRound } from "lucide-react";
import { BRAND } from "../lib/brand";
import { openStatus } from "../lib/hours";
import { useCart } from "./cart/CartProvider";
import { useSession } from "../hooks/useDevice";
import { useOrders } from "../hooks/useShop";
import { ordersOf } from "../lib/tracking";
import { useSettings } from "../hooks/useShop";

const STATUS_REFRESH_MS = 60_000;
// The wordmark file is 2173 x 1227 (trimmed); width follows height so the
// mark is never squashed.
const LOGO_RATIO = 900 / 508;
const LOGO_HEIGHT = 40;

function OpenPill() {
  const { hours } = useSettings();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const update = () => setStatus(openStatus(new Date(), hours));
    update();
    const timer = setInterval(update, STATUS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [hours]);

  if (!status) return <span className="h-7 w-28" aria-hidden="true" />;
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-semibold ${
        status.isOpen ? "bg-[#e8f3e4] text-[#24561c]" : "bg-surface text-muted"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${status.isOpen ? "bg-go shadow-[0_0_0_3px_rgb(40_122_28/0.18)]" : "bg-muted/60"}`}
        aria-hidden="true"
      />
      {status.label}
    </span>
  );
}

function accountLabelFor(session, active, isOnTheWay) {
  if (!session) return "Sign in or view your account";
  const base = `My orders and account, ${session.name}`;
  if (isOnTheWay) return `${base}. Your order is on the way`;
  if (active.length > 0) return `${base}. ${active.length} order${active.length === 1 ? "" : "s"} in progress`;
  return base;
}

export default function Header() {
  const { summary, setIsCartOpen } = useCart();
  const session = useSession();
  const orders = useOrders();
  const active = session ? ordersOf(orders, session.id).active : [];
  const isOnTheWay = active.some((o) => o.status === "out_for_delivery");
  const accountLabel = accountLabelFor(session, active, isOnTheWay);

  return (
    <header className="sticky top-0 z-40 bg-ground/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
      <div className="page-gutter mx-auto flex h-16 max-w-[760px] items-center justify-between gap-3">
        <a href="/" className="shrink-0 rounded-md" aria-label={`${BRAND.name}, home`}>
          <img
            src="/brand/logo.svg"
            alt="Flex Chicken"
            width={Math.round(LOGO_HEIGHT * LOGO_RATIO)}
            height={LOGO_HEIGHT}
            className="h-10 w-auto"
          />
        </a>

        <div className="flex items-center gap-2">
          <span className="hidden min-[460px]:inline-flex">
            <OpenPill />
          </span>
          <a
            href="/account"
            className="press relative flex size-11 items-center justify-center rounded-full bg-ground-raised text-ink ring-1 ring-line hover:bg-surface"
            aria-label={accountLabel}
          >
            {active.length > 0 && (
              <span
                className={`absolute right-0 top-0 size-3 rounded-full ring-2 ring-ground ${isOnTheWay ? "animate-pulse bg-go" : "bg-flex"}`}
                aria-hidden="true"
              />
            )}
            {session ? (
              <span className="font-display text-[15px] font-extrabold text-flex-ink" aria-hidden="true">
                {session.name.slice(0, 1).toUpperCase()}
              </span>
            ) : (
              <UserRound className="size-[18px]" strokeWidth={2} aria-hidden="true" />
            )}
          </a>
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            data-box-target
            className="press on-dark relative flex h-11 items-center gap-2 rounded-full bg-roast-800 pl-3.5 pr-4 text-[13px] font-semibold text-cream shadow-[0_8px_18px_-10px_rgb(45_28_21/0.8)] hover:bg-roast-700"
            aria-label={`Open your Flex Box, ${summary.count} item${summary.count === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="size-[18px]" strokeWidth={2} aria-hidden="true" />
            <span aria-hidden="true">Box</span>
            <span
              className="flex min-w-6 items-center justify-center rounded-full bg-flex px-1.5 text-[12px] leading-6 text-white"
              aria-hidden="true"
            >
              <NumberFlow value={summary.count} />
            </span>
          </button>
        </div>
      </div>
      <div className="flame-rule h-[3px]" aria-hidden="true" />
    </header>
  );
}
