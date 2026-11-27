import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { authorize } from "@/lib/permissions";
import { listAreas } from "@/lib/rounds";
import { requireActor } from "@/lib/session";
import { createRoundAction } from "../actions";
import { RoundForm } from "../round-form";
import { PageHeader } from "../ui";

// The page reads the session and the database at request time, so with
// Cache Components it streams in behind a Suspense boundary.
export default function NewRoundPage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-4xl px-4 py-8 text-zinc-600">Loading…</p>}>
      <NewRoundPageContent />
    </Suspense>
  );
}

async function NewRoundPageContent() {
  const actor = await requireActor();
  if (authorize(actor, "round.manage")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <PageHeader title="New round" back={{ href: "/rounds", label: "Rounds" }} />
        <p className="text-zinc-700">Only coordinators and admins can create rounds.</p>
      </main>
    );
  }
  const areas = await listAreas(prisma, actor);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageHeader title="New round" back={{ href: "/rounds", label: "Rounds" }} />
      <p className="mb-6 text-sm text-zinc-600">The round is saved as a draft. You can still change everything until you open it.</p>
      <RoundForm
        action={createRoundAction}
        areas={areas}
        submitLabel="Save draft"
        values={{ name: "", date: "", location: "", items: [], areas: [], flags: [], minHouseholdSize: null }}
      />
    </main>
  );
}
