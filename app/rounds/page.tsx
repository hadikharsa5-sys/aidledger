import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { listRounds } from "@/lib/rounds";
import { requireActor } from "@/lib/session";
import { buttonClass, formatDate, PageHeader, StatusBadge } from "./ui";

// The page reads the session and the database at request time, so with
// Cache Components it streams in behind a Suspense boundary.
export default function RoundsPage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-4xl px-4 py-8 text-zinc-600">Loading…</p>}>
      <RoundsPageContent />
    </Suspense>
  );
}

async function RoundsPageContent() {
  const actor = await requireActor();
  const rounds = await listRounds(prisma, actor);
  const canManage = can(actor.role, "round.manage");

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <PageHeader title="Distribution rounds">
        {canManage && (
          <Link href="/rounds/new" className={buttonClass}>
            New round
          </Link>
        )}
      </PageHeader>

      {rounds.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-zinc-600">
          No rounds yet.{canManage && " Create the first one with “New round”."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-4 py-2 font-medium">Round</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Pickups</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.id} className="border-t border-zinc-200">
                  <td className="px-4 py-2">
                    <Link href={`/rounds/${r.id}`} className="font-medium underline-offset-2 hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{formatDate(r.date)}</td>
                  <td className="px-4 py-2">{r.location}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.pickupCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
