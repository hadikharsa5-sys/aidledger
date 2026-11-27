import Link from "next/link";
import type { RoundStatus, VulnerabilityFlag } from "@/generated/prisma/client";

// Small shared pieces for the round pages.

export const STATUS_LABEL: Record<RoundStatus, string> = { DRAFT: "Draft", OPEN: "Open", CLOSED: "Closed" };

const STATUS_STYLE: Record<RoundStatus, string> = {
  DRAFT: "bg-zinc-100 text-zinc-800 border-zinc-300",
  OPEN: "bg-green-50 text-green-800 border-green-300",
  CLOSED: "bg-zinc-800 text-white border-zinc-800",
};

export function StatusBadge({ status }: { status: RoundStatus }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export const FLAG_LABEL: Record<VulnerabilityFlag, string> = {
  ELDERLY: "Elderly",
  DISABILITY: "Disability",
  SINGLE_PARENT: "Single parent",
  CHRONIC_ILLNESS: "Chronic illness",
  DISPLACED: "Displaced",
  LARGE_FAMILY: "Large family",
  OTHER: "Other",
};

export function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Beirut" }).format(d);
}

export function PageHeader({ title, back, children }: { title: string; back?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="text-sm text-zinc-600 hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}

export const buttonClass = "inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60";
export const secondaryButtonClass = "inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium";
