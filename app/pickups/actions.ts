"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { recordPickup, voidPickup, type PickupResult, type Proxy } from "@/lib/pickups";
import { requireActor } from "@/lib/session";

// Server actions for pickups (MR-12, MR-16). The scan and result screens
// (MR-13, MR-14) call these. The user always comes from the session; the lib
// functions check the role, the round, eligibility and the organisation, and
// the database's partial unique index decides who wins a double scan.

export async function recordPickupAction(input: {
  roundId: string;
  householdCode: string;
  point?: string | null;
  proxy?: Proxy | null;
}): Promise<PickupResult> {
  const actor = await requireActor();
  const result = await recordPickup(prisma, actor, {
    roundId: String(input.roundId ?? ""),
    householdCode: String(input.householdCode ?? "").trim(),
    point: input.point ?? null,
    proxy: input.proxy ?? null,
  });
  if (result.status === 201) revalidatePath(`/rounds/${input.roundId}`);
  return result;
}

export async function voidPickupAction(input: { pickupId: string; roundId: string; reason: string }) {
  const actor = await requireActor();
  const result = await voidPickup(prisma, actor, { pickupId: String(input.pickupId ?? ""), reason: String(input.reason ?? "") });
  if (result.status === 200) revalidatePath(`/rounds/${input.roundId}`);
  return result;
}
