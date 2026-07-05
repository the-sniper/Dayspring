"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { draftOutreachAction } from "@/lib/actions/outreach";

export default function DraftOutreachButton({
  contactId,
  jobId,
}: {
  contactId: number;
  jobId: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex items-center gap-1">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await draftOutreachAction(contactId, jobId);
            if (res.ok) router.push("/outreach");
            else setError(res.error);
          })
        }
        className="rounded border border-amber-600 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
      >
        {pending ? "Drafting…" : "Draft outreach"}
      </button>
    </span>
  );
}
