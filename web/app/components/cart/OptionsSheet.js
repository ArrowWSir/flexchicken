"use client";
import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import NumberFlow from "@number-flow/react";
import { Check } from "lucide-react";
import { defaultSelections, missingRequired, unitPence } from "../../lib/cart";
import { useCart } from "./CartProvider";
import QtyStepper from "../ui/QtyStepper";

const GBP = { style: "currency", currency: "GBP" };

function OptionGroup({ option, value, onChange }) {
  // Optional extras with one choice act as a toggle; everything else is a radio list.
  const isToggle = !option.isRequired;
  return (
    <fieldset className="mt-5">
      <legend className="flex w-full items-baseline justify-between text-[14px] font-semibold">
        {option.label}
        <span className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${option.isRequired ? "text-flex-ink" : "text-muted"}`}>
          {option.isRequired ? "Required" : "Optional"}
        </span>
      </legend>
      <div className="mt-2 grid gap-2">
        {option.choices.map((choice) => {
          const isChecked = value === choice.label;
          return (
            <label
              key={choice.label}
              className={`press flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[14px] ring-1 ${
                isChecked ? "bg-roast-800 text-cream ring-roast-800" : "bg-ground-raised ring-field hover:ring-roast-700"
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`flex size-5 items-center justify-center rounded-full ring-1 ${
                    isChecked ? "bg-flex ring-flex" : "ring-field"
                  }`}
                  aria-hidden="true"
                >
                  {isChecked && <Check className="size-3 text-white" strokeWidth={3} />}
                </span>
                {choice.label}
              </span>
              {choice.priceAdd > 0 && <span className="font-semibold">+£{choice.priceAdd.toFixed(2)}</span>}
              <input
                type={isToggle ? "checkbox" : "radio"}
                name={option.label}
                checked={isChecked}
                onChange={() => onChange(isToggle && isChecked ? undefined : choice.label)}
                className="sr-only"
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function OptionsSheet() {
  const { pending, confirm, cancelPending } = useCart();
  const [selections, setSelections] = useState({});
  const [qty, setQty] = useState(1);
  const item = pending?.item;

  useEffect(() => {
    if (!pending) return;
    setSelections(defaultSelections(pending.item));
    setQty(pending.qty);
  }, [pending]);

  const missing = item ? missingRequired(item, selections) : [];
  const total = item ? (unitPence(item, selections) * qty) / 100 : 0;

  return (
    <Drawer.Root open={Boolean(pending)} onOpenChange={(open) => !open && cancelPending()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-roast-950/45 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-[560px] flex-col rounded-t-[28px] bg-ground outline-none">
          <Drawer.Handle className="mt-3 !w-12 !bg-line" />
          {item && (
            <>
              <div className="overflow-y-auto px-5 pb-4 pt-4">
                <Drawer.Title className="font-display text-[24px] font-black uppercase leading-none tracking-[-0.01em]">
                  {item.name}
                </Drawer.Title>
                <Drawer.Description className="mt-1.5 text-[13.5px] text-muted">
                  {item.description || "Make it how you like it."}
                </Drawer.Description>
                {item.options.map((option) => (
                  <OptionGroup
                    key={option.label}
                    option={option}
                    value={selections[option.label]}
                    onChange={(choice) => setSelections((current) => ({ ...current, [option.label]: choice }))}
                  />
                ))}
              </div>
              <div className="border-t border-line bg-ground-raised px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                <div className="flex items-center justify-between">
                  <QtyStepper value={qty} onChange={setQty} label={item.name} />
                  <span className="font-display text-[22px] font-extrabold">
                    <NumberFlow value={total} format={GBP} locales="en-GB" />
                  </span>
                </div>
                <button
                  type="button"
                  disabled={missing.length > 0}
                  onClick={() => confirm(selections, qty)}
                  className="press mt-3 flex h-13 w-full items-center justify-center rounded-2xl bg-flex py-3.5 text-[15px] font-semibold text-white hover:bg-flex-deep disabled:bg-line disabled:text-muted"
                >
                  {missing.length > 0
                    ? `Choose ${missing.join(" & ").toLowerCase()}`
                    : pending.mode === "buy"
                      ? "Buy now"
                      : "Add to Box"}
                </button>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
