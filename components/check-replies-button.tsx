"use client";

import { useState, useTransition } from "react";
import { checkRepliesAction } from "@/lib/actions/outreach";

export default function CheckRepliesButton({ enabled }: { enabled: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || !enabled}
        title={enabled ? "Scan Gmail threads for replies" : "Connect Gmail first (Settings)"}
        onClick={() =>
          startTransition(async () => {
            const res = await checkRepliesAction();
            setMessage(
              res.found > 0
                ? `${res.found} repl${res.found === 1 ? "y" : "ies"} found 🎉 (${res.checked} checked)`
                : `No new replies (${res.checked} checked)`,
            );
          })
        }
        className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Check replies"}
      </button>
      {message && !pending && <p className="text-xs text-stone-500">{message}</p>}
    </div>
  );
}
