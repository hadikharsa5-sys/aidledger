import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { authorize } from "@/lib/permissions";
import { getRound, listAreas } from "@/lib/rounds";
import { requireActor } from "@/lib/session";
import { updateRoundAction } from "../../actions";
import { RoundForm } from "../../round-form";
import { PageHeader } from "../../ui";

// The page reads the session and the database at request time, so with
// Cache Components it streams in behind a Suspense boundary.
export default function EditRoundPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-4xl px-4 py-8 text-zinc-600">Loading…</p>}>
      <EditRoundPageContent params={params} />
    </Suspense>
  );
}

async function EditRoundPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const round = await getRound(prisma, actor, id);
  if (!round) notFound();
  const back = { href: `/rounds/${id}`, label: round.name };

  if (authorize(actor, "round.manage") || round.status === "CLOSED") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <PageHeader title="Edit round" back={back} />
        <p className="text-zinc-700">
          {round.status === "CLOSED" ? "This round is closed and can't be changed." : "Only coordinators and admins can edit rounds."}
        </p>
      </main>
    );
  }
  // Keep the areas already chosen even if no household lives there any more.
  const areas = [...new Set([...(await listAreas(prisma, actor)), ...(round.eligibility.areas ?? [])])].sort();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageHeader title="Edit round" back={back} />
      <RoundForm
        action={updateRoundAction.bind(null, id)}
        areas={areas}
        submitLabel="Save changes"
        lockItemsAndRules={round.status === "OPEN"}
        values={{
          name: round.name,
          date: round.date.toISOString().slice(0, 10),
          location: round.location,
          items: round.items.map((i) => ({ name: i.name, quantityPerHousehold: i.quantityPerHousehold })),
          areas: round.eligibility.areas ?? [],
          flags: round.eligibility.flags ?? [],
          minHouseholdSize: round.eligibility.minHouseholdSize ?? null,
        }}
      />
    </main>
  );
}
