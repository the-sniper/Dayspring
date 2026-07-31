import Link from "next/link";
import { BarChart3, ArrowLeft } from "lucide-react";
import PageHeader from "@/components/page-header";
import { api, convex } from "@/lib/convex/server";
import { HUMAN_EDIT_FLOOR_PCT } from "@/shared/outreach-rules";

export const dynamic = "force-dynamic";

// Published benchmarks (Pin outreach report 4M+ messages Jun'25–May'26; Gem
// 2026 recruiting benchmarks) shown next to your own numbers, so you know
// whether the system is working — the tools that fail in this category are
// exactly the ones that never publish a funnel.
const BENCHMARKS = [
  ["Automated email reply rate", "4.96%"],
  ["Human-written email reply rate", "6.31%"],
  ["LinkedIn message reply rate", "17.08%"],
  ["Cold application → offer", "~0.5% (1 in 200)"],
  ["Replies landing in touches 1–3", "93.2%"],
  ["30–50 researched messages", "5–15 replies, 1–3 conversations"],
] as const;

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

type Row = { label: string; sent: number; replied: number };

function SegmentTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-muted-foreground">
            <th className="py-1 font-semibold"> </th>
            <th className="py-1 text-right font-semibold">sent</th>
            <th className="py-1 text-right font-semibold">replies</th>
            <th className="py-1 text-right font-semibold">rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/60">
              <td className="py-1.5 font-medium text-foreground">{r.label}</td>
              <td className="py-1.5 text-right">{r.sent}</td>
              <td className="py-1.5 text-right">{r.replied}</td>
              <td className="py-1.5 text-right font-semibold text-foreground">
                {pct(r.replied, r.sent)}
              </td>
            </tr>
          ))}
          {rows.every((r) => r.sent === 0) && (
            <tr>
              <td colSpan={4} className="py-2 text-xs text-muted-foreground">
                Nothing sent in this segment yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function OutreachMetricsPage() {
  const queue = await convex().query(api.outreach.queue, {});
  const sent = queue.filter((o) => o.sentAt);
  const replied = sent.filter((o) => o.repliedAt);

  const byChannel: Row[] = ["email", "linkedin"].map((ch) => {
    const s = sent.filter((o) => (o.channel ?? "email") === ch);
    return {
      label: ch === "email" ? "Email" : "LinkedIn (hand-sent)",
      sent: s.length,
      replied: s.filter((o) => o.repliedAt).length,
    };
  });

  // Segment by the contact's strongest affiliation at send time — does the
  // affiliation actually earn the reply for you?
  const strengthOf = (o: (typeof sent)[number]) =>
    Math.max(0, ...(o.affiliations ?? []).map((a) => a.strength));
  const byStrength: Row[] = [0, 1, 2, 3].map((s) => {
    const rows = sent.filter((o) => strengthOf(o) === s);
    return {
      label: s === 0 ? "No affiliation" : `Strength ${s}`,
      sent: rows.length,
      replied: rows.filter((o) => o.repliedAt).length,
    };
  });

  // Does hand-writing more actually help? The most interesting number in the
  // system, once there's enough volume to mean anything.
  const editBuckets: [string, (p: number) => boolean][] = [
    [`Below floor (<${HUMAN_EDIT_FLOOR_PCT}%)`, (p) => p < HUMAN_EDIT_FLOOR_PCT],
    [`${HUMAN_EDIT_FLOOR_PCT}–79%`, (p) => p >= HUMAN_EDIT_FLOOR_PCT && p < 80],
    ["80–100%", (p) => p >= 80],
  ];
  const byEdit: Row[] = editBuckets.map(([label, fits]) => {
    const rows = sent.filter(
      (o) => o.humanEditedPct !== undefined && fits(o.humanEditedPct),
    );
    return {
      label,
      sent: rows.length,
      replied: rows.filter((o) => o.repliedAt).length,
    };
  });

  const byTouch: Row[] = [1, 2, 3].map((t) => {
    const rows = sent.filter((o) => (o.touchNumber ?? 1) === t);
    return {
      label: `Touch ${t}`,
      sent: rows.length,
      replied: rows.filter((o) => o.repliedAt).length,
    };
  });

  return (
    <div className="mx-auto max-w-3xl stagger-load">
      <PageHeader
        eyebrow="Pipeline"
        icon={<BarChart3 size={14} />}
        title="Outreach funnel"
        description={
          <>
            {sent.length} sent · {replied.length} replies (
            {pct(replied.length, sent.length)}).{" "}
            {sent.length < 30 &&
              "Small sample — read these as anecdotes, not statistics, until you're past ~30 sends."}
          </>
        }
        actions={
          <Link
            href="/outreach"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={13} /> Back to queue
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SegmentTable title="By channel" rows={byChannel} />
        <SegmentTable title="By affiliation strength" rows={byStrength} />
        <SegmentTable title="By how much you rewrote" rows={byEdit} />
        <SegmentTable title="By touch number" rows={byTouch} />
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Benchmarks (Pin 4M+ messages · Gem 2026)
        </h3>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {BENCHMARKS.map(([label, value]) => (
              <tr key={label} className="border-t border-border/60 first:border-t-0">
                <td className="py-1.5 font-medium text-muted-foreground">
                  {label}
                </td>
                <td className="py-1.5 text-right font-semibold text-foreground">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          If 40 researched messages land you in the 5–15 reply band, the system
          works. If it takes 400 to get there, you built the thing that
          doesn&apos;t.
        </p>
      </div>
    </div>
  );
}
