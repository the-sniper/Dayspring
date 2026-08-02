import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/page-header";
import Markdown from "@/components/markdown";
import { fmtDate, fmtTime } from "@/lib/orchestra/format";
import { api, convex } from "@/lib/convex/server";
import { localAvatar } from "@/lib/orchestra/avatars";
import { employee, reportsToLabel } from "@/lib/orchestra/registry";
import { resolveTier } from "@/lib/orchestra/tiers";
import { todayDate } from "@/lib/orchestra/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// /company/team/[id] — one employee: who they are, what they're doing right
// now, and everything they've done (contracts, deliverables, verdicts, spend).

const STATUS_STYLE: Record<string, string> = {
  verified: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  delivered: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  in_progress: "bg-stone-500/10 text-stone-600 dark:text-stone-400",
  queued: "bg-stone-500/10 text-stone-500",
  blocked: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  escalated: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  failed: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

function Chip({ text, style }: { text: string; style?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        style ?? "bg-secondary text-muted-foreground",
      )}
    >
      {text.replace("_", " ")}
    </span>
  );
}

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const e = employee(id);
  if (!e) notFound();

  const today = todayDate();
  const [tier, tasks] = await Promise.all([
    resolveTier(),
    convex().query(api.orchestra.tasksByRole, { role: id, limit: 40 }),
  ]);
  const artifacts = await Promise.all(
    tasks
      .slice(0, 15)
      .map((t) =>
        t.artifactId
          ? convex().query(api.orchestra.getArtifact, { artifactId: t.artifactId })
          : Promise.resolve(null),
      ),
  );
  const artifactByTask = new Map(
    tasks.slice(0, 15).map((t, i) => [String(t._id), artifacts[i]]),
  );

  const current = tasks.find(
    (t) =>
      t.runDate === today &&
      ["queued", "in_progress", "delivered"].includes(t.status),
  );
  const done = tasks.filter((t) => t !== current);
  const verified = tasks.filter((t) => t.status === "verified").length;
  const escalated = tasks.filter((t) => t.status === "escalated").length;
  const totalSpend = artifacts
    .filter(Boolean)
    .reduce((n, a) => n + (a?.costUsd ?? 0), 0);
  const model =
    e.modelRole === "code" ? "pure code" : tier.models[e.modelRole];

  return (
    <div className="mx-auto max-w-3xl stagger-load">
      <PageHeader
        eyebrow={e.team}
        icon={
          localAvatar(e) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={localAvatar(e)} alt="" className="h-5 w-5 object-contain" />
          ) : undefined
        }
        title={e.name}
        description={
          <>
            {e.title} · reports to{" "}
            <span className="font-semibold text-foreground">
              {reportsToLabel(e)}
            </span>{" "}
            · runs on{" "}
            <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
              {model}
            </span>
            {tasks.length > 0 && (
              <>
                {" "}
                · {verified} verified / {tasks.length} tasks
                {escalated ? ` · ${escalated} escalated` : ""} · tokens ≈ $
                {totalSpend.toFixed(2)} (recent artifacts)
              </>
            )}
          </>
        }
        actions={
          <Link
            href="/company/team"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={13} /> Team
          </Link>
        }
      />

      <section className="mb-8 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Responsibilities
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-0.5 pl-4 text-[13px] text-foreground">
          {e.responsibilities.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Working on right now
        </h2>
        {current ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                {current.objective}
              </span>
              <Chip text={current.status} style={STATUS_STYLE[current.status]} />
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              DoD: {current.definitionOfDone.join(" · ")}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {e.status === "planned"
              ? `Not hired yet (Phase ${e.phase}).`
              : e.modelRole === "code"
                ? "Always on — runs as code inside every cycle, no discrete tasks."
                : "On bench — nothing in flight. Normal between runs."}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Work history ({done.length})
        </h2>
        <div className="flex flex-col gap-3">
          {done.map((t) => {
            const artifact = artifactByTask.get(String(t._id));
            return (
              <details
                key={String(t._id)}
                className="group rounded-2xl border border-border bg-card shadow-sm transition-all open:shadow-md"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5 px-4 py-3">
                  <span className="text-[10px] font-bold text-muted-foreground/60">
                    {fmtDate(t.runDate)} · {fmtTime(t.updatedAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {t.objective}
                  </span>
                  {t.verdict && (
                    <Chip
                      text={t.verdict}
                      style={
                        t.verdict === "confirmed"
                          ? STATUS_STYLE.verified
                          : STATUS_STYLE.escalated
                      }
                    />
                  )}
                  <Chip text={t.status} style={STATUS_STYLE[t.status]} />
                </summary>
                <div className="border-t border-border/60 px-4 py-4 text-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Contract
                  </p>
                  <ul className="mt-1.5 list-disc pl-4 text-[13px] text-foreground">
                    {t.definitionOfDone.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                  {t.statusReason && (
                    <p className="mt-2 text-[12px] text-amber-600 dark:text-amber-400">
                      {t.statusReason}
                    </p>
                  )}
                  {t.verificationNotes && (
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      Verifier notes: {t.verificationNotes}
                    </p>
                  )}
                  {artifact && (
                    <div className="mt-3 rounded-xl bg-secondary/40 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip text={artifact.kind} />
                        <Chip text={artifact.honestStatus} />
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {artifact.model} · ${artifact.costUsd.toFixed(3)} ·{" "}
                          {artifact.tokensOut.toLocaleString()} out-tokens
                        </span>
                      </div>
                      <p className="mt-2 text-[13px] font-semibold text-foreground">
                        {artifact.summary}
                      </p>
                      <div className="mt-2 max-h-80 overflow-y-auto">
                        <Markdown text={artifact.body} />
                      </div>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
          {done.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No completed tasks yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
