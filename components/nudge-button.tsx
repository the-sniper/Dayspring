"use client";

import { useState, useTransition } from "react";
import { draftNudgeAction } from "@/lib/actions/outreach";

export default function NudgeButton({ originalId }: { originalId: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex items-center gap-1">
      {error && <span className="text-red-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await draftNudgeAction(originalId);
            if (!res.ok) setError(res.error);
          })
        }
        className="rounded border border-amber-600 bg-amber-50 px-2 py-0.5 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        title="Drafts a short follow-up into the same thread — lands in Drafts for approval"
      >
        {pending ? "Drafting…" : "Draft nudge"}
      </button>
    </span>
  );
}
