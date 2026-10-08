"use client";
import { useSearchParams } from "next/navigation";
import { Check, Phone } from "lucide-react";
import { BRAND } from "../lib/brand";
import { formatPrice } from "../lib/cart";
import { ORDER_FLOW, STATUS_LABEL, STATUS_MESSAGE, formatOrderNumber } from "../lib/orders";
import { isOrdersLoaded, useOrder, useOrders } from "../hooks/useShop";
import DriverMap from "../components/map/DriverMap";

const timeOf = (at) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function Timeline({ order }) {
  const flow = order.status === "cancelled" ? ["placed", "cancelled"] : ORDER_FLOW[order.mode];
  const reached = new Map(order.history.map((h) => [h.status, h.at]));
  const currentAt = flow.indexOf(order.status);
  return (
    <ol className="grid gap-0" aria-label="Order progress">
      {flow.map((status, i) => {
        const isDone = i <= currentAt;
        const isCurrent = i === currentAt;
        return (
          <li key={status} className="relative flex gap-3 pb-4 last:pb-0">
            {i < flow.length - 1 && (
              <span className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 ${i < currentAt ? "bg-flex" : "bg-line"}`} aria-hidden="true" />
            )}
            <span
              className={`relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full ${
                isDone ? "bg-flex text-white" : "bg-surface text-muted ring-1 ring-line"
              } ${isCurrent ? "ring-4 ring-flex/20" : ""}`}
            >
              {isDone ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : <span className="text-[11px] font-bold">{i + 1}</span>}
            </span>
            <span className="pt-0.5">
              <span className={`block text-[14px] ${isCurrent ? "font-bold text-ink" : isDone ? "font-semibold text-ink" : "text-muted"}`}>
                {STATUS_LABEL[status]}
                {isCurrent && <span className="sr-only"> (current step)</span>}
              </span>
              {reached.has(status) && <span className="block text-[12px] text-muted">{timeOf(reached.get(status))}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function TrackOrder() {
  const id = useSearchParams().get("id");
  const order = useOrder(id);
  const isLoaded = isOrdersLoaded(useOrders());

  if (!order && !isLoaded) {
    return <p className="py-16 text-center text-[14px] text-muted" role="status">Finding your order…</p>;
  }
  if (!order) {
    return (
      <div className="mx-auto max-w-[520px] rounded-[24px] bg-ground-raised p-6 text-center shadow-paper ring-1 ring-line">
        <h1 className="font-display text-[22px] font-black uppercase">Order not found</h1>
        <p className="mt-2 text-[14px] text-muted">
          Check the link, or see all your orders in <a className="font-semibold text-flex-ink underline" href="/account">your account</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[560px] gap-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flex-ink">
          Order {formatOrderNumber(order.number)} · {order.mode === "delivery" ? "Delivery" : "Collection"}
        </p>
        <h1 className="mt-1 font-display text-[30px] font-black uppercase leading-[0.95] tracking-[-0.02em]" aria-live="polite">
          {STATUS_LABEL[order.status]}
        </h1>
        <p className="mt-2 text-[14.5px] text-muted" aria-live="polite">
          {STATUS_MESSAGE[order.status]}
        </p>
        {order.readyBy && ["placed", "accepted", "preparing"].includes(order.status) && (
          <p className="mt-3 inline-flex rounded-full bg-surface px-3.5 py-1.5 text-[13.5px] font-semibold text-ink ring-1 ring-line">
            {order.mode === "delivery" ? "Leaves the kitchen" : "Ready to collect"} around {timeOf(order.readyBy)}
          </p>
        )}
      </div>

      <DriverMap order={order} />

      <section className="rounded-[24px] bg-ground-raised p-5 shadow-paper ring-1 ring-line">
        <Timeline order={order} />
      </section>

      <section className="rounded-[24px] bg-ground-raised p-5 shadow-paper ring-1 ring-line" aria-labelledby="items-heading">
        <h2 id="items-heading" className="font-display text-[15px] font-extrabold uppercase tracking-[0.04em]">
          Your order
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {order.lines.map((line) => (
            <li key={line.key} className="flex justify-between gap-3 py-2.5 text-[14px]">
              <span>
                <span className="font-semibold">
                  {line.qty} × {line.name}
                </span>
                {line.choices.length > 0 && <span className="block text-[12px] text-muted">{line.choices.map((c) => c.choice).join(" · ")}</span>}
              </span>
              <span className="font-semibold">{formatPrice(line.unitPence * line.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 grid gap-1 border-t border-line pt-3 text-[14px]">
          {order.totals.discountPence > 0 && (
            <div className="flex justify-between gap-3 font-semibold text-go-deep">
              <dt className="min-w-0 truncate">Offer: {order.promo?.title ?? "Discount"}</dt>
              <dd className="shrink-0">−{formatPrice(order.totals.discountPence)}</dd>
            </div>
          )}
          {order.mode === "delivery" && (
            <div className="flex justify-between text-muted">
              <dt>Delivery</dt>
              <dd>{order.totals.deliveryPence ? formatPrice(order.totals.deliveryPence) : "Free"}</dd>
            </div>
          )}
          <div className="flex justify-between font-display text-[18px] font-extrabold">
            <dt>Total</dt>
            <dd>{formatPrice(order.totals.totalPence)}</dd>
          </div>
        </dl>
      </section>

      <a
        href={BRAND.phone.href}
        className="press flex h-12 items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold text-flex-ink ring-1 ring-line hover:bg-surface"
      >
        <Phone className="size-4" strokeWidth={2.2} aria-hidden="true" />
        Call the shop · {BRAND.phone.label}
      </a>
    </div>
  );
}
