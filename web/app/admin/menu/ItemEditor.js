"use client";
import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { photoToDataUrl } from "../../lib/imageUpload";

const field =
  "h-11 w-full rounded-xl bg-cream/8 px-3.5 text-[15px] text-cream ring-1 ring-cream/45 placeholder:text-cream/40 focus:outline-none focus:ring-2 focus:ring-flame-light";

const blankOption = () => ({ label: "", isRequired: true, choices: [{ label: "", priceAdd: 0 }] });

// Options: groups of choices, like "Drink" (required) or "Make it cheesy" (+£0.39).
function OptionsEditor({ options, onChange }) {
  const set = (i, patch) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const setChoice = (i, k, patch) =>
    set(i, { choices: options[i].choices.map((c, j) => (j === k ? { ...c, ...patch } : c)) });

  return (
    <div className="grid gap-3">
      {options.map((option, i) => (
        <fieldset key={i} className="rounded-2xl bg-cream/5 p-3 ring-1 ring-cream/10">
          <legend className="sr-only">Option group {i + 1}</legend>
          <div className="flex gap-2">
            <input
              value={option.label}
              onChange={(e) => set(i, { label: e.target.value })}
              placeholder="Group name, e.g. Drink"
              aria-label="Option group name"
              className={field}
            />
            <button
              type="button"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="press flex size-11 shrink-0 items-center justify-center rounded-xl text-flame-light ring-1 ring-cream/15"
              aria-label={`Remove option group ${option.label || i + 1}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-[13px] text-cream/80">
            <input type="checkbox" checked={option.isRequired} onChange={(e) => set(i, { isRequired: e.target.checked })} className="size-4 accent-[#d92b2d]" />
            Customer must choose one
          </label>
          <ul className="mt-2 grid gap-2">
            {option.choices.map((choice, k) => (
              <li key={k} className="flex gap-2">
                <input
                  value={choice.label}
                  onChange={(e) => setChoice(i, k, { label: e.target.value })}
                  placeholder="Choice, e.g. Pepsi"
                  aria-label="Choice name"
                  className={field}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={choice.priceAdd}
                  onChange={(e) => setChoice(i, k, { priceAdd: Math.max(0, Number(e.target.value) || 0) })}
                  aria-label="Extra price in pounds"
                  className={`${field} w-24 shrink-0`}
                />
                <button
                  type="button"
                  onClick={() => set(i, { choices: option.choices.filter((_, j) => j !== k) })}
                  className="press flex size-11 shrink-0 items-center justify-center rounded-xl text-cream/60 ring-1 ring-cream/15"
                  aria-label={`Remove choice ${choice.label || k + 1}`}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => set(i, { choices: [...option.choices, { label: "", priceAdd: 0 }] })}
            className="mt-2 text-[13px] font-semibold text-flame-light"
          >
            + Add choice
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, blankOption()])}
        className="press flex h-11 items-center justify-center gap-2 rounded-xl text-[13.5px] font-semibold text-cream ring-1 ring-dashed ring-cream/25 hover:bg-cream/5"
      >
        <Plus className="size-4" aria-hidden="true" />
        Add option group
      </button>
    </div>
  );
}

// Drop half-filled rows before saving, so the shop never shows an empty choice.
const tidyOptions = (options) =>
  options
    .map((o) => ({ ...o, label: o.label.trim(), choices: o.choices.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), priceAdd: c.priceAdd })) }))
    .filter((o) => o.label && o.choices.length);

/**
 * Edit an existing item or create a new one. `item` null + `categoryId` = new.
 */
export default function ItemEditor({ isOpen, item, categoryId, categories, onSave, onClose }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setDraft(
      item
        ? { name: item.name, price: String(item.price), description: item.description ?? "", categoryId: item.categoryId, image: item.image ?? null, options: item.options ?? [] }
        : { name: "", price: "", description: "", categoryId, image: null, options: [] }
    );
  }, [isOpen, item, categoryId]);

  const pickPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsBusy(true);
    try {
      const image = await photoToDataUrl(file);
      setDraft((d) => ({ ...d, image }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      await onSave({ ...draft, price: draft.price.trim() === "" ? "" : Number(draft.price), options: tidyOptions(draft.options) });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content className="on-dark fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-[620px] flex-col rounded-t-[28px] bg-roast-900 text-cream outline-none">
          <Drawer.Handle className="mt-3 !w-12 !bg-cream/20" />
          {draft && (
            <form onSubmit={save} className="flex min-h-0 flex-col">
              <div className="overflow-y-auto px-5 pb-4 pt-4">
                <Drawer.Title className="font-display text-[22px] font-black uppercase">{item ? "Edit item" : "New item"}</Drawer.Title>
                <Drawer.Description className="mt-1 text-[13px] text-cream/60">Changes show on the shop straight away.</Drawer.Description>

                <div className="mt-4 flex gap-3">
                  <label className="press relative flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-cream/8 ring-1 ring-cream/15">
                    {draft.image ? (
                      <img src={draft.image} alt="" className="size-full object-contain" />
                    ) : (
                      <ImagePlus className="size-7 text-cream/50" aria-hidden="true" />
                    )}
                    <span className="sr-only">Choose a photo</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} className="sr-only" />
                  </label>
                  <div className="grid flex-1 gap-2">
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder="Item name"
                      aria-label="Item name"
                      className={field}
                    />
                    <div className="flex gap-2">
                      <span className="flex h-11 items-center rounded-xl bg-cream/8 px-3 text-cream/70 ring-1 ring-cream/15">£</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={draft.price}
                        onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                        placeholder="0.00"
                        aria-label="Price in pounds"
                        className={field}
                      />
                    </div>
                  </div>
                </div>
                {draft.image && (
                  <button type="button" onClick={() => setDraft((d) => ({ ...d, image: null }))} className="mt-2 text-[12.5px] font-semibold text-cream/60 underline">
                    Remove photo
                  </button>
                )}

                <label className="mt-3 grid gap-1.5 text-[13px] font-semibold">
                  Category
                  <select value={draft.categoryId} onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))} className={field}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id} className="text-ink">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 grid gap-1.5 text-[13px] font-semibold">
                  Description
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    rows={2}
                    maxLength={240}
                    className="w-full rounded-xl bg-cream/8 px-3.5 py-2.5 text-[15px] font-normal ring-1 ring-cream/45 focus:outline-none focus:ring-2 focus:ring-flame-light"
                  />
                </label>

                <h3 className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-[0.14em] text-cream/70">Options</h3>
                <OptionsEditor options={draft.options} onChange={(options) => setDraft((d) => ({ ...d, options }))} />
              </div>

              <div className="border-t border-cream/10 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                {error && (
                  <p role="alert" className="mb-2 text-[13px] font-semibold text-flame-light">
                    {error}
                  </p>
                )}
                <button type="submit" disabled={isBusy} className="press h-12 w-full rounded-2xl bg-flex text-[15px] font-semibold text-white hover:bg-flex-deep disabled:opacity-60">
                  {item ? "Save changes" : "Add to menu"}
                </button>
              </div>
            </form>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
