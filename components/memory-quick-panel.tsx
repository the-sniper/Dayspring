"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Brain, Loader2, X } from "lucide-react";
import Link from "next/link";
import { removeMemoryItemAction, type MemoryList } from "@/lib/actions/campaign";
import { fmtDate } from "@/lib/orchestra/format";
import { cn } from "@/lib/utils";

// Symmetry panel. The Studio writes to memory in three places — a skip files a
// lesson, "this sounded like me" files a sample, an applied proposal files
// either — so the Studio has to be able to take those back out too. Removing
// from the same screen that added it is the whole point; the full editor lives
// on the Team page.

type Row = { key: string; label: string; meta: string | null };

function List({
  title,
  empty,
  rows,
  list,
}: {
  title: string;
  empty: string;
  rows: Row[];
  list: MemoryList;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function remove(i: number) {
    setBusy(i);
    startTransition(async () => {
      await removeMemoryItemAction(list, i);
      setBusy(null);
      router.refresh();
    });
  }

  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {title} ({rows.length})
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-[11px] italic text-muted-foreground/50">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li
              key={r.key}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-secondary/10 px-3 py-2"
            >
              <div className="min-w-0">
                {r.meta && (
                  <span className="text-[9px] font-bold uppercase tracking-widest text-brand-500/70">
                    {r.meta}
                  </span>
                )}
                <p className="line-clamp-3 text-[12px] leading-relaxed text-foreground/85">
                  {r.label}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(i)}
                title="Remove from memory"
                className={cn(
                  "mt-0.5 shrink-0 rounded-lg p-1 text-muted-foreground/50 transition-colors hover:bg-rose-500/10 hover:text-rose-500",
                  pending && busy === i && "opacity-50",
                )}
              >
                {pending && busy === i ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <X size={12} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MemoryQuickPanel({
  lessons,
  samples,
}: {
  lessons: { date: string; text: string }[];
  samples: { text: string; performance: string | null }[];
}) {
  return (
    <section className="rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-foreground">
            <Brain size={18} className="text-brand-500" /> What the team
            remembers
          </h2>
          <p className="text-sm text-muted-foreground">
            Everything the Studio can add, it can also take back out. Anything
            you remove here stops influencing the next campaign.
          </p>
        </div>
        <Link
          href="/company/team"
          className="rounded-xl border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted"
        >
          Full memory editor
        </Link>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <List
          title="Lessons"
          empty="No lessons yet — skipping a draft with a reason files one."
          list="lessons"
          rows={lessons.map((l, i) => ({
            key: `${l.date}-${i}`,
            label: l.text,
            meta: l.date ? fmtDate(l.date) : null,
          }))}
        />
        <List
          title="Voice samples"
          empty="No samples yet — mark a shipped post as sounding like you."
          list="samples"
          rows={samples.map((s, i) => ({
            key: `sample-${i}`,
            label: s.text.slice(0, 220),
            meta: s.performance,
          }))}
        />
      </div>
    </section>
  );
}
