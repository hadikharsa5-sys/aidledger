"use client";

import { useActionState } from "react";
import type { RoundStatus } from "@/generated/prisma/client";
import { changeStatusAction, type FormState } from "../actions";
import { buttonClass } from "../ui";

const CONFIRM: Partial<Record<RoundStatus, string>> = {
  OPEN: "Open this round? Items and eligibility will be locked and volunteers can start recording pickups.",
  CLOSED: "Close this round? No more pickups can be recorded and it can't be reopened.",
};

/** Moves the round to its next status, after a confirmation (MR-10). */
export function StatusButton({ roundId, to, label }: { roundId: string; to: RoundStatus; label: string }) {
  const [state, action, pending] = useActionState<FormState>(changeStatusAction.bind(null, roundId, to), undefined);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (CONFIRM[to] && !window.confirm(CONFIRM[to])) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : label}
      </button>
      {state?.error && (
        <p role="alert" className="max-w-xs text-right text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
