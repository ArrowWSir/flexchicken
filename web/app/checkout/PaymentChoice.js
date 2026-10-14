import { Banknote, CreditCard } from "lucide-react";

/**
 * How the customer pays. Cash is the only way for now; card (Teya) shows as
 * coming soon and cannot be picked until it is connected.
 */
export default function PaymentChoice({ mode }) {
  const isDelivery = mode === "delivery";
  return (
    <fieldset className="mt-4 grid min-w-0 gap-2">
      <legend className="mb-2 text-[13px] font-semibold">How you pay</legend>
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-ground-raised p-3.5 ring-2 ring-go">
        <input type="radio" name="payment" value="cash" defaultChecked className="size-4 accent-go" />
        <Banknote className="size-5 shrink-0 text-go-deep" strokeWidth={1.9} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold">{isDelivery ? "Cash on delivery" : "Pay when you collect"}</span>
          <span className="block text-[12.5px] text-muted">{isDelivery ? "Pay the driver in cash at your door." : "Pay at the counter when you pick up."}</span>
        </span>
      </label>
      <label className="flex items-center gap-3 rounded-2xl bg-surface/60 p-3.5 ring-1 ring-line">
        <input type="radio" name="payment" value="card" disabled aria-describedby="card-soon" className="size-4" />
        <CreditCard className="size-5 shrink-0 text-muted" strokeWidth={1.9} aria-hidden="true" />
        <span className="min-w-0 flex-1 text-muted">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[14.5px] font-semibold">Pay by card</span>
            <span className="rounded-full bg-roast-800 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-cream">Coming soon</span>
          </span>
          <span id="card-soon" className="block text-[12.5px]">
            Not available yet. Pay in cash for now.
          </span>
        </span>
      </label>
    </fieldset>
  );
}
