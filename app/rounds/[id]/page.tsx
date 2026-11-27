import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getExpectedList, getRound } from "@/lib/rounds";
import { requireActor } from "@/lib/session";
import { FLAG_LABEL, formatDate, PageHeader, secondaryButtonClass, StatusBadge } from "../ui";
import { StatusButton } from "./status-button";

// The page reads the session and the database at request time, so with
// Cache Components it streams in behind a Suspense boundary.
export default function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-4xl px-4 py-8 text-zinc-600">Loading…</p>}>
      <RoundPageContent params={params} />
    </Suspense>
  );
}

async function RoundPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const round = await getRound(prisma, actor, id);
  if (!round) notFound();

  const canManage = can(actor.role, "round.manage");
  const expected = can(actor.role, "round.viewExpected") ? await getExpectedList(prisma, actor, id) : null;
  const rules = round.eligibility;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <PageHeader title={round.name} back={{ href: "/rounds", label: "Rounds" }}>
        <StatusBadge status={round.status} />
        {canManage && round.status !== "CLOSED" && (
          <Link href={`/rounds/${id}/edit`} className={secondaryButtonClass}>
            Edit
          </Link>
        )}
        {canManage && round.status === "DRAFT" && <StatusButton roundId={id} to="OPEN" label="Open round" />}
        {canManage && round.status === "OPEN" && <StatusButton roundId={id} to="CLOSED" label="Close round" />}
      </PageHeader>

      <dl className="mb-8 grid gap-4 rounded-md border border-zinc-200 p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-zinc-600">Date</dt>
          <dd className="font-medium">{formatDate(round.date)}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Location</dt>
          <dd className="font-medium">{round.location}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Pickups recorded</dt>
          <dd className="font-medium tabular-nums">{round.pickupCount}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Created by</dt>
          <dd className="font-medium">{round.createdBy.name}</dd>
        </div>
      </dl>

      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Items per household</h2>
          {round.items.length === 0 ? (
            <p className="text-sm text-zinc-600">No items yet. A round needs at least one item before it can open.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 text-sm">
              {round.items.map((it) => (
                <li key={it.id} className="flex justify-between px-4 py-2">
                  <span>{it.name}</span>
                  <span className="font-medium tabular-nums">× {it.quantityPerHousehold}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Who is eligible</h2>
          <ul className="list-disc pl-5 text-sm">
            <li>{rules.areas?.length ? `Areas: ${rules.areas.join(", ")}` : "Every area"}</li>
            <li>{rules.flags?.length ? `At least one of: ${rules.flags.map((f) => FLAG_LABEL[f]).join(", ")}` : "No vulnerability requirement"}</li>
            <li>{rules.minHouseholdSize ? `${rules.minHouseholdSize} or more people` : "Any household size"}</li>
          </ul>
        </section>
      </div>

      {expected?.status === 200 && (
        <section>
          <h2 className="mb-1 font-semibold">
            Expected households: <span className="tabular-nums">{expected.count}</span>
          </h2>
          <p className="mb-3 text-sm text-zinc-600">Active households that match the rules above. A merged household is counted once.</p>
          {expected.count > 0 && (
            <div className="max-h-[32rem] overflow-auto rounded-md border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Head of household</th>
                    <th className="px-4 py-2 font-medium">Area</th>
                    <th className="px-4 py-2 text-right font-medium">People</th>
                    <th className="px-4 py-2 font-medium">Card code</th>
                  </tr>
                </thead>
                <tbody>
                  {expected.households.map((h) => (
                    <tr key={h.id} className="border-t border-zinc-200">
                      <td className="px-4 py-1.5">
                        <bdi>{h.headName}</bdi>
                      </td>
                      <td className="px-4 py-1.5">{h.area}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{h.size}</td>
                      <td className="px-4 py-1.5 font-mono text-xs">{h.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
