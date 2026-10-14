"use client";
import { Bike, MapPin, MessageSquareText, Phone, Store } from "lucide-react";
import { formatPrice } from "../../lib/cart";
import { STATUS_LABEL, formatOrderNumber, ticketUrgency } from "../../lib/orders";

const URGENCY = {
  fresh: "bg-go",
  warm: "bg-[#d98a1b]",
  late: "bg-flex",
};

function elapsed(from, now) {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

const timeOf = (at) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * A kitchen ticket, like a printed docket on the pass: number, age, how it
 * leaves the shop, every line with its choices, and the next action.
 * `actions`: [{ label, onClick, tone: "go" | "quiet" | "danger" }]
 */
export default function OrderTicket({ order, now, actions = [], footer = null }) {
  const isFinishedStatus = ["delivered", "collected", "cancelled"].includes(order.status);
  const urgency = isFinishedStatus ? null : ticketUrgency(order.createdAt, now);
  const isDelivery = order.mode === "delivery";

  return (
    <article
      aria-label={`Order ${formatOrderNumber(order.number)}, ${STATUS_LABEL[order.status]}`}
      className="overflow-hidden rounded-[18px] bg-[#fffdf8] text-ink shadow-[0_14px_28px_-16px_rgb(0_0_0/0.8)]"
    >
      <header className={`flex items-center gap-2 px-3.5 py-2.5 text-white ${urgency ? URGENCY[urgency] : "bg-roast-700"}`}>
        <span className="shrink-0 font-display text-[21px] font-black leading-none tracking-[-0.01em]">{formatOrderNumber(order.number)}</span>
        <span className="mr-auto flex min-w-0 items-center gap-1 rounded-full bg-black/20 px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em]">
          {isDelivery ? <Bike className="size-3.5" aria-hidden="true" /> : <Store className="size-3.5" aria-hidden="true" />}
          {isDelivery ? "Delivery" : "Collect"}
        </span>
        <span className="shrink-0 text-right font-display text-[15px] font-extrabold tabular-nums leading-none">
          {isFinishedStatus ? timeOf(order.history.at(-1).at) : elapsed(order.createdAt, now)}
          <span className="block text-[10.5px] font-semibold">{timeOf(order.createdAt)}</span>
        </span>
      </header>

      <div className="px-3.5 pb-3 pt-2.5">
        <p className="flex items-center justify-between gap-2 text-[13px]">
          <span className="truncate font-semibold">{order.customer.name}</span>
          {order.customer.phone && (
            <a href={`tel:${order.customer.phone.replace(/\s/g, "")}`} className="flex shrink-0 items-center gap-1 font-semibold text-flex-ink">
              <Phone className="size-3.5" aria-hidden="true" />
              {order.customer.phone}
            </a>
          )}
        </p>
        {isDelivery && order.address && (
          <p className="mt-1 flex gap-1.5 text-[12.5px] leading-snug text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {order.address.line1}
              {order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.postcode} · {order.address.miles} mi
            </span>
          </p>
        )}

        <ul className="mt-2.5 grid gap-1.5 border-t border-dashed border-line pt-2.5">
          {order.lines.map((line) => (
            <li key={line.key} className="text-[14.5px] leading-snug">
              <span className="font-display font-extrabold">{line.qty} ×</span> <span className="font-semibold">{line.name}</span>
              {line.choices.length > 0 && (
                <ul className="ml-6 mt-0.5 text-[12.5px] text-muted">
                  {line.choices.map((c) => (
                    <li key={c.option}>– {c.choice}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {order.note && (
          <p className="mt-2.5 flex gap-1.5 rounded-xl bg-[#fff3c4] px-2.5 py-2 text-[12.5px] font-medium leading-snug text-[#5a4300]">
            <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {order.note}
          </p>
        )}

        <p className="mt-2.5 flex items-center justify-between border-t border-dashed border-line pt-2 text-[12.5px] text-muted">
          <span>
            {STATUS_LABEL[order.status]}
            {order.driver ? ` · ${order.driver.name}` : ""}
          </span>
          <span className="font-semibold text-ink">
            {formatPrice(order.totals.totalPence)}
            {order.totals.discountPence > 0 && ` (offer −${formatPrice(order.totals.discountPence)})`} · {order.payment?.status === "paid" ? "Paid" : isDelivery ? "Cash on delivery" : "Pay at pickup"}
          </span>
        </p>

        {actions.length > 0 && (
          <div className="mt-3 flex gap-2">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={`press h-12 rounded-xl px-3 text-[14px] font-bold ${
                  action.tone === "go"
                    ? "flex-1 bg-roast-800 text-cream hover:bg-roast-700"
                    : action.tone === "danger"
                      ? "text-flex-ink ring-1 ring-line hover:bg-[#fde8e6]"
                      : "flex-1 bg-surface text-ink hover:bg-line"
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        {footer}
      </div>
    </article>
  );
}
