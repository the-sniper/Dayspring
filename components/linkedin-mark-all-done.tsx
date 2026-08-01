"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";
import { markPostsDoneAction } from "@/lib/actions/linkedin-posts";

export default function LinkedinMarkAllDone({ postIds }: { postIds: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (postIds.length === 0) return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markPostsDoneAction(postIds);
          router.refresh();
        })
      }
      className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground transition-all hover:border-emerald-500 hover:text-emerald-600 active:scale-95 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <CheckCheck size={13} strokeWidth={2.5} />
      )}
      Mark {postIds.length} done
    </button>
  );
}
