"use client";
import { ChevronRight } from "lucide-react";
import { formatPrice } from "../lib/cart";
import { ORDER_FLOW, STATUS_LABEL, STATUS_MESSAGE, formatOrderNumber } from "../lib/orders";
import DriverMap from "../components/map/DriverMap";

function Progress({ order }) {
  const flow = ORDER_FLOW[order.mode];
  const at = flow.indexOf(order.status);
  return (
    <div className="flex gap-1" role="img" aria-label={`Step ${at + 1} of ${flow.length}`}>
      {flow.map((status, i) => (
        <span key={status} className={`h-1.5 flex-1 rounded-full ${i <= at ? "bg-flex" : "bg-line"}`} />
      ))}
    </div>
  );
}

/** An order still moving: where it is, and the driver live once it is on the way. */
export default function ActiveOrderCard({ order }) {
  const isOnTheWay = order.status === "out_for_delivery";
  const title = `Order ${formatOrderNumber(order.number)}`;
  const itemCount = order.lines.reduce((n, l) => n + l.qty, 0);

  return (
    <article
      aria-label={`${title}, ${STATUS_LABEL[order.status]}`}
      className={`grid gap-3 rounded-[22px] bg-ground-raised p-4 shadow-paper ring-1 ${isOnTheWay ? "ring-go/40" : "ring-line"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flex-ink">
            {title} · {order.mode === "delivery" ? "Delivery" : "Collection"}
          </p>
          <p className="mt-1 font-display text-[22px] font-black uppercase leading-none" aria-live="polite">
            {STATUS_LABEL[order.status]}
          </p>
        </div>
        <span className="shrink-0 pt-0.5 text-[12.5px] text-muted">
          {itemCount} items · {formatPrice(order.totals.totalPence)}
        </span>
      </div>
      <Progress order={order} />
      <p className="text-[13.5px] text-muted">{STATUS_MESSAGE[order.status]}</p>

      {isOnTheWay ? (
        <DriverMap order={order} height={200} headingLevel={3} showAddress={false} />
      ) : (
        order.mode === "delivery" && (
          <p className="rounded-2xl bg-surface px-3 py-2.5 text-[12.5px] text-muted">
            Your driver&rsquo;s live location shows here as soon as they set off.
          </p>
        )
      )}

      <a
        href={`/track?id=${encodeURIComponent(order.id)}`}
        className="press flex h-11 items-center justify-center gap-1 rounded-2xl bg-roast-800 text-[14px] font-semibold text-cream hover:bg-roast-700"
      >
        Track order
        <ChevronRight className="size-4" aria-hidden="true" />
      </a>
    </article>
  );
}
