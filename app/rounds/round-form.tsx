"use client";

import { useActionState, useState } from "react";
import type { VulnerabilityFlag } from "@/generated/prisma/client";
import type { FormState } from "./actions";
import { buttonClass, FLAG_LABEL } from "./ui";

type Item = { name: string; quantityPerHousehold: number };

export type RoundFormValues = {
  name: string;
  date: string; // yyyy-mm-dd
  location: string;
  items: Item[];
  areas: string[];
  flags: VulnerabilityFlag[];
  minHouseholdSize: number | null;
};

const input = "rounded-md border border-zinc-300 px-3 py-2 text-base font-normal";
const label = "flex flex-col gap-1 text-sm font-medium";

/**
 * Create / edit form for a round (MR-10). When `lockItemsAndRules` is true
 * (the round is open) items and eligibility are shown read-only and not sent.
 */
export function RoundForm({
  action,
  values,
  areas,
  submitLabel,
  lockItemsAndRules = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values: RoundFormValues;
  areas: string[];
  submitLabel: string;
  lockItemsAndRules?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [items, setItems] = useState<Item[]>(values.items.length ? values.items : [{ name: "", quantityPerHousehold: 1 }]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="itemsAndRules" value={lockItemsAndRules ? "0" : "1"} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>
          Name
          <input name="name" required maxLength={120} defaultValue={values.name} placeholder="Winter kits, December" className={input} />
        </label>
        <label className={label}>
          Date
          <input name="date" type="date" required defaultValue={values.date} className={input} />
        </label>
        <label className={label}>
          Location
          <input name="location" required maxLength={200} defaultValue={values.location} placeholder="Tabbaneh hall" className={input} />
        </label>
      </fieldset>

      <fieldset disabled={lockItemsAndRules} className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Items per household</legend>
        {lockItemsAndRules && <p className="text-sm text-zinc-600">Items are locked while the round is open.</p>}
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              name="itemName"
              aria-label={`Item ${i + 1} name`}
              value={item.name}
              onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, name: e.target.value } : it)))}
              placeholder="Food parcel"
              maxLength={80}
              className={`${input} flex-1`}
            />
            <input
              name="itemQty"
              aria-label={`Item ${i + 1} quantity`}
              type="number"
              min={1}
              max={100}
              value={item.quantityPerHousehold}
              onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, quantityPerHousehold: Number(e.target.value) } : it)))}
              className={`${input} w-24`}
            />
            {!lockItemsAndRules && items.length > 1 && (
              <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="px-2 text-sm text-zinc-600 hover:underline">
                Remove
              </button>
            )}
          </div>
        ))}
        {!lockItemsAndRules && items.length < 20 && (
          <button type="button" onClick={() => setItems([...items, { name: "", quantityPerHousehold: 1 }])} className="self-start text-sm font-medium hover:underline">
            + Add item
          </button>
        )}
      </fieldset>

      <fieldset disabled={lockItemsAndRules} className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-semibold">Who is eligible</legend>
        {lockItemsAndRules && <p className="text-sm text-zinc-600">Eligibility is locked while the round is open.</p>}

        <div className={label}>
          Areas <span className="font-normal text-zinc-600">(none ticked = every area)</span>
          <div className="flex flex-wrap gap-x-4 gap-y-2 font-normal">
            {areas.length === 0 && <span className="text-zinc-600">No households registered yet.</span>}
            {areas.map((a) => (
              <label key={a} className="flex items-center gap-2">
                <input type="checkbox" name="areas" value={a} defaultChecked={values.areas.includes(a)} />
                {a}
              </label>
            ))}
          </div>
        </div>

        <div className={label}>
          Must have at least one of these <span className="font-normal text-zinc-600">(none ticked = no requirement)</span>
          <div className="flex flex-wrap gap-x-4 gap-y-2 font-normal">
            {(Object.keys(FLAG_LABEL) as VulnerabilityFlag[]).map((f) => (
              <label key={f} className="flex items-center gap-2">
                <input type="checkbox" name="flags" value={f} defaultChecked={values.flags.includes(f)} />
                {FLAG_LABEL[f]}
              </label>
            ))}
          </div>
        </div>

        <label className={`${label} max-w-xs`}>
          Minimum household size <span className="font-normal text-zinc-600">(empty = any size)</span>
          <input name="minHouseholdSize" type="number" min={1} max={30} defaultValue={values.minHouseholdSize ?? ""} className={input} />
        </label>
      </fieldset>

      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
