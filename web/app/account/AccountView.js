"use client";
import { useState } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { formatPrice } from "../lib/cart";
import { STATUS_LABEL, formatOrderNumber } from "../lib/orders";
import { ordersOf } from "../lib/tracking";
import { getRepo } from "../lib/store";
import { useSession } from "../hooks/useDevice";
import { useOrders } from "../hooks/useShop";
import SignInSheet from "../components/account/SignInSheet";
import ActiveOrderCard from "./ActiveOrderCard";

const dateOf = (at) =>
  new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function PastOrders({ orders, hasActive }) {
  return (
    <div className="grid gap-2.5">
      {hasActive && <h3 className="mt-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">Past orders</h3>}
      <ul className="grid gap-2.5">
        {orders.map((order) => (
          <li key={order.id}>
            <a
              href={`/track?id=${encodeURIComponent(order.id)}`}
              className="press flex items-center gap-3 rounded-[22px] bg-ground-raised p-4 shadow-paper ring-1 ring-line hover:ring-roast-700/30"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-display text-[15px] font-extrabold">{formatOrderNumber(order.number)}</span>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">{STATUS_LABEL[order.status]}</span>
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                  {dateOf(order.createdAt)} · {order.lines.reduce((n, l) => n + l.qty, 0)} items · {formatPrice(order.totals.totalPence)}
                </span>
              </span>
              <ChevronRight className="size-5 text-muted" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AccountView() {
  const session = useSession();
  const orders = useOrders();
  const [isSignInOpen, setIsSignInOpen] = useState(false);

  if (!session) {
    return (
      <div className="mx-auto max-w-[520px] rounded-[24px] bg-ground-raised p-6 text-center shadow-paper ring-1 ring-line">
        <h1 className="font-display text-[24px] font-black uppercase">Your account</h1>
        <p className="mt-2 text-[14px] text-muted">Sign in to see your orders and track deliveries.</p>
        <button
          type="button"
          onClick={() => setIsSignInOpen(true)}
          className="press mt-4 h-12 w-full rounded-2xl bg-roast-800 text-[14.5px] font-semibold text-cream hover:bg-roast-700"
        >
          Sign in
        </button>
        <SignInSheet isOpen={isSignInOpen} onOpenChange={setIsSignInOpen} reason="Sign in to see your orders." />
      </div>
    );
  }

  const { active, past } = ordersOf(orders, session.id);

  return (
    <div className="mx-auto grid max-w-[560px] gap-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flex-ink">Your account</p>
          <h1 className="mt-1 truncate font-display text-[30px] font-black uppercase leading-none">{session.name}</h1>
          <p className="mt-1 truncate text-[13px] text-muted">
            {session.email}
            {session.phone ? ` · ${session.phone}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => getRepo().signOut()}
          className="press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-semibold text-muted ring-1 ring-line hover:text-ink"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          Sign out
        </button>
      </div>

      <section aria-labelledby="orders-heading" className="grid gap-3">
        <h2 id="orders-heading" className="font-display text-[15px] font-extrabold uppercase tracking-[0.04em]">
          My orders
        </h2>
        {active.length === 0 && past.length === 0 && (
          <p className="rounded-[22px] bg-ground-raised p-5 text-[14px] text-muted shadow-paper ring-1 ring-line">
            No orders yet. <a href="/#menu" className="font-semibold text-flex-ink underline">Pick your craving</a>.
          </p>
        )}
        {active.map((order) => (
          <ActiveOrderCard key={order.id} order={order} />
        ))}
        {past.length > 0 && <PastOrders orders={past} hasActive={active.length > 0} />}
      </section>
    </div>
  );
}
