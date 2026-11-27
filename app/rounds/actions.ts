"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RoundStatus, VulnerabilityFlag } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { changeRoundStatus, createRound, updateRound, type RoundInput } from "@/lib/rounds";
import { requireActor } from "@/lib/session";

// Server actions for the round screens (MR-10). The user always comes from
// the session; the lib functions check roles and write the audit log.

export type FormState = { error: string } | undefined;

const MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  round_not_found: "This round doesn't exist or belongs to another organisation.",
  round_closed: "This round is closed and can't be changed.",
  round_open: "Items and eligibility can't change once the round is open.",
  invalid_transition: "That status change isn't allowed.",
  status_changed: "Someone else changed this round in the meantime. Reload the page and try again.",
  no_items: "Add at least one item before opening the round.",
};

function message(result: { error: string }) {
  return MESSAGES[result.error] ?? result.error; // validation errors are already readable
}

/** Turns the round form into a RoundInput. Items come as repeated itemName / itemQty fields. */
function readForm(formData: FormData, opts: { itemsAndRules: boolean }): Partial<RoundInput> {
  const text = (name: string) => String(formData.get(name) ?? "");
  const input: Partial<RoundInput> = {
    name: text("name"),
    date: text("date"),
    location: text("location"),
  };
  if (opts.itemsAndRules) {
    const names = formData.getAll("itemName").map(String);
    const qtys = formData.getAll("itemQty").map(String);
    input.items = names
      .map((name, i) => ({ name: name.trim(), quantityPerHousehold: Number(qtys[i]) }))
      .filter((it) => it.name !== ""); // empty rows are ignored
    const minSize = text("minHouseholdSize").trim();
    input.eligibility = {
      areas: formData.getAll("areas").map(String),
      flags: formData.getAll("flags").map(String) as VulnerabilityFlag[],
      minHouseholdSize: minSize === "" ? undefined : Number(minSize),
    };
  }
  return input;
}

export async function createRoundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const result = await createRound(prisma, actor, readForm(formData, { itemsAndRules: true }) as RoundInput);
  if (result.status !== 201) return { error: message(result) };
  revalidatePath("/rounds");
  redirect(`/rounds/${result.roundId}`);
}

export async function updateRoundAction(roundId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  // The edit form only sends items and rules while the round is a draft.
  const itemsAndRules = formData.get("itemsAndRules") === "1";
  const result = await updateRound(prisma, actor, roundId, readForm(formData, { itemsAndRules }));
  if (result.status !== 200) return { error: message(result) };
  revalidatePath("/rounds");
  revalidatePath(`/rounds/${roundId}`);
  redirect(`/rounds/${roundId}`);
}

export async function changeStatusAction(roundId: string, to: RoundStatus): Promise<FormState> {
  const actor = await requireActor();
  const result = await changeRoundStatus(prisma, actor, roundId, to);
  if (result.status !== 200) return { error: message(result) };
  revalidatePath("/rounds");
  revalidatePath(`/rounds/${roundId}`);
  return undefined;
}
