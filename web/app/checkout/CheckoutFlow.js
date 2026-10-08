"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NumberFlow from "@number-flow/react";
import { Bike, CreditCard, LogOut, ShoppingBag, Store } from "lucide-react";
import { BRAND } from "../lib/brand";
import { formatPrice } from "../lib/cart";
import { deliveryQuote } from "../lib/geo";
import { openStatus } from "../lib/hours";
import { getRepo } from "../lib/store";
import { useSettings } from "../hooks/useShop";
import { useSession } from "../hooks/useDevice";
import { useCart } from "../components/cart/CartProvider";
import SignInSheet from "../components/account/SignInSheet";
import ShopMap from "../components/map/ShopMap";
import DeliveryCheck from "./DeliveryCheck";

const GBP = { style: "currency", currency: "GBP" };
// Closed hours block orders in production; in development the screens stay
// usable at any hour.
const ENFORCE_HOURS = process.env.NODE_ENV === "production";

function Step({ number, title, children }) {
  return (
    <section className="rounded-[24px] bg-ground-raised p-4 shadow-paper ring-1 ring-line sm:p-5" aria-labelledby={`step-${number}`}>
      <h2 id={`step-${number}`} className="flex items-center gap-2.5 font-display text-[15px] font-extrabold uppercase tracking-[0.04em]">
        <span className="flex size-6 items-center justify-center rounded-full bg-roast-800 text-[12px] text-cream">{number}</span>
        {title}
      </h2>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

const inputClass =
  "h-12 w-full rounded-2xl bg-ground-raised px-4 text-[15px] ring-1 ring-field placeholder:text-muted/80 focus:outline-none focus:ring-2 focus:ring-flex-ink";

export default function CheckoutFlow() {
  const router = useRouter();
  const session = useSession();
  const settings = useSettings();
  const { cart, summary, isReady, clear, setIsCartOpen } = useCart();
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [mode, setMode] = useState("delivery");
  const [place, setPlace] = useState(null);
  const [address, setAddress] = useState({ line1: "", line2: "" });
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [hours, setHours] = useState(null);

  useEffect(() => setHours(openStatus(new Date(), settings.hours)), [settings.hours]);
  useEffect(() => {
    if (session?.phone) setPhone((current) => current || session.phone);
  }, [session]);
  useEffect(() => {
    if (!settings.isDeliveryOn) setMode("collection");
  }, [settings.isDeliveryOn]);

  const { subtotalPence, discountPence, itemsPence, promo, count } = summary;
  // The delivery minimum counts the food after the offer, as the order does.
  const quote = deliveryQuote(settings, itemsPence, place);
  const deliveryPence = mode === "delivery" && quote.isAvailable ? quote.feePence : 0;
  const totalPence = itemsPence + deliveryPence;
  const isClosed = ENFORCE_HOURS && hours && !hours.isOpen;

  if (!isReady) return <div className="mx-auto h-64 max-w-[560px] animate-pulse rounded-[24px] bg-surface" />;
  if (cart.lines.length === 0 && !isPlacing) {
    return (
      <div className="mx-auto max-w-[520px] rounded-[24px] bg-ground-raised p-6 text-center shadow-paper ring-1 ring-line">
        <ShoppingBag className="mx-auto size-8 text-roast-700" strokeWidth={1.6} aria-hidden="true" />
        <h1 className="mt-3 font-display text-[22px] font-black uppercase">Your Box is empty</h1>
        <a href="/#menu" className="press mt-4 inline-flex rounded-full bg-roast-800 px-5 py-2.5 text-[14px] font-semibold text-cream">
          Back to the menu
        </a>
      </div>
    );
  }

  const placeOrder = async () => {
    setError(null);
    if (!session) {
      setIsSignInOpen(true);
      return;
    }
    if (isClosed) {
      setError(`We are closed right now (${hours.label}).`);
      return;
    }
    if (mode === "delivery" && !address.line1.trim()) {
      setError("Add your house number and street.");
      return;
    }
    setIsPlacing(true);
    try {
      const repo = getRepo();
      repo.updateProfile({ phone });
      const order = await repo.placeOrder({
        cart,
        customer: { ...session, phone },
        mode,
        address:
          mode === "delivery" && place
            ? { line1: address.line1.trim(), line2: address.line2.trim(), postcode: place.postcode, latitude: place.latitude, longitude: place.longitude, miles: place.miles }
            : null,
        note,
      });
      clear();
      router.push(`/track?id=${encodeURIComponent(order.id)}`);
    } catch (err) {
      setError(err.message);
      setIsPlacing(false);
    }
  };

  const canPlace = mode === "collection" || (place && quote.isAvailable);

  return (
    <div className="mx-auto grid max-w-[560px] gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flex-ink">Checkout</p>
        <h1 className="mt-1 font-display text-[32px] font-black uppercase leading-none tracking-[-0.02em]">Your Flex Box</h1>
      </div>

      <Step number={1} title="Your account">
        {session ? (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[14px]">
              <span className="block truncate font-semibold">{session.name}</span>
              <span className="block truncate text-[12.5px] text-muted">{session.email}</span>
            </p>
            <button type="button" onClick={() => getRepo().signOut()} className="press flex items-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-semibold text-muted ring-1 ring-line hover:text-ink">
              <LogOut className="size-3.5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setIsSignInOpen(true)} className="press h-12 w-full rounded-2xl bg-roast-800 text-[14.5px] font-semibold text-cream hover:bg-roast-700">
            Sign in to order
          </button>
        )}
      </Step>

      <Step number={2} title="Delivery or collection">
        <div role="radiogroup" aria-label="How you get your order" className="grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1">
          {[
            { id: "delivery", label: "Delivery", icon: Bike, disabled: !settings.isDeliveryOn },
            { id: "collection", label: "Collection", icon: Store, disabled: false },
          ].map(({ id, label, icon: Icon, disabled }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              disabled={disabled}
              onClick={() => setMode(id)}
              className={`press flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold disabled:opacity-40 ${
                mode === id ? "bg-roast-800 text-cream shadow-[0_8px_16px_-10px_rgb(45_28_21/0.9)]" : "text-muted hover:text-ink"
              }`}
            >
              <Icon className="size-4" strokeWidth={2.1} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {mode === "delivery" ? (
          <div className="mt-4 grid gap-3">
            <DeliveryCheck
              place={place}
              onPlace={setPlace}
              quote={quote}
              onSwitchToCollection={() => setMode("collection")}
            />
            {place && quote.isAvailable && (
              <div className="grid gap-2">
                <input
                  value={address.line1}
                  onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
                  placeholder="House number and street"
                  autoComplete="address-line1"
                  aria-label="House number and street"
                  className={inputClass}
                />
                <input
                  value={address.line2}
                  onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value }))}
                  placeholder="Flat, floor or buzzer (optional)"
                  autoComplete="address-line2"
                  aria-label="Flat, floor or buzzer"
                  className={inputClass}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <p className="text-[13.5px] text-muted">
              Collect from <strong className="font-semibold text-ink">{BRAND.address.short}</strong>. Ready in about{" "}
              {settings.prepMinutes} minutes.
            </p>
            <ShopMap height={170} label="Map: Flex Chicken on Upminster Road South" center={BRAND.geo} markers={[{ kind: "shop", ...BRAND.geo }]} />
          </div>
        )}
      </Step>

      <Step number={3} title="Contact and notes">
        <div className="grid gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Mobile number"
            autoComplete="tel"
            inputMode="tel"
            aria-label="Mobile number"
            className={inputClass}
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything the kitchen or driver should know? (optional)"
            rows={2}
            maxLength={280}
            aria-label="Note for the kitchen or driver"
            className="w-full rounded-2xl bg-ground-raised px-4 py-3 text-[15px] ring-1 ring-field placeholder:text-muted/80 focus:outline-none focus:ring-2 focus:ring-flex-ink"
          />
        </div>
      </Step>

      <Step number={4} title="Summary and payment">
        <ul className="divide-y divide-line">
          {cart.lines.map((line) => (
            <li key={line.key} className="flex justify-between gap-3 py-2.5 text-[14px]">
              <span className="min-w-0">
                <span className="font-semibold">
                  {line.qty} × {line.name}
                </span>
                {line.choices.length > 0 && <span className="block text-[12px] text-muted">{line.choices.map((c) => c.choice).join(" · ")}</span>}
              </span>
              <span className="shrink-0 font-semibold">{formatPrice(line.unitPence * line.qty)}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setIsCartOpen(true)} className="mt-1 text-[12.5px] font-semibold text-flex-ink underline-offset-4 hover:underline">
          Edit Box ({count} item{count === 1 ? "" : "s"})
        </button>

        <dl className="mt-3 grid gap-1.5 border-t border-line pt-3 text-[14px]">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatPrice(subtotalPence)}</dd>
          </div>
          {promo && (
            <div className="flex justify-between gap-3 font-semibold text-go-deep">
              <dt className="min-w-0 truncate">Offer: {promo.title}</dt>
              <dd className="shrink-0">−{formatPrice(discountPence)}</dd>
            </div>
          )}
          {mode === "delivery" && (
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd>{!place ? "Enter postcode" : quote.isAvailable ? formatPrice(quote.feePence) : quote.isInArea ? "Minimum not reached" : "Not available"}</dd>
            </div>
          )}
          <div className="flex justify-between font-display text-[20px] font-extrabold">
            <dt>Total</dt>
            <dd>
              <NumberFlow value={totalPence / 100} format={GBP} locales="en-GB" />
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex gap-3 rounded-2xl bg-surface p-4">
          <CreditCard className="mt-0.5 size-5 shrink-0 text-roast-700" strokeWidth={1.9} aria-hidden="true" />
          <p className="text-[12.5px] leading-relaxed text-muted">
            <strong className="font-semibold text-ink">Card payment by Teya is being connected.</strong> Until it is live, you pay
            {mode === "delivery" ? " the driver on delivery" : " when you collect"}.
          </p>
        </div>
      </Step>

      {error && (
        <p role="alert" className="rounded-2xl bg-[#fde8e6] px-4 py-3 text-[13.5px] font-medium text-[#8a1517]">
          {error}
        </p>
      )}
      {isClosed && (
        <p className="rounded-2xl bg-surface px-4 py-3 text-[13.5px] text-muted">We are closed right now · {hours.label}.</p>
      )}

      <button
        type="button"
        onClick={placeOrder}
        disabled={!canPlace || isPlacing || isClosed || !settings.isTakingOrders}
        className="press sticky bottom-[max(1rem,env(safe-area-inset-bottom))] h-14 rounded-2xl bg-flex text-[16px] font-semibold text-white shadow-[0_16px_30px_-14px_rgb(217_43_45/0.8)] hover:bg-flex-deep disabled:bg-line disabled:text-muted disabled:shadow-none"
      >
        {!settings.isTakingOrders
          ? "Not taking orders right now"
          : !canPlace
            ? mode === "delivery" && place
              ? quote.isInArea
                ? `Delivery minimum is ${formatPrice(settings.minDeliveryOrderPence)}`
                : "Delivery not available here"
              : "Check your postcode first"
            : !session
              ? "Sign in to place order"
              : `Place order · ${formatPrice(totalPence)}`}
      </button>

      <SignInSheet isOpen={isSignInOpen} onOpenChange={setIsSignInOpen} />
    </div>
  );
}
