"use client";

import { useState, useTransition } from "react";
import { Link2, Plus, X } from "lucide-react";
import {
  addAffiliationAction,
  removeAffiliationAction,
} from "@/lib/actions/affiliations";

export type AffiliationRow = {
  id: string;
  kind: string;
  detail: string;
  strength: number;
  evidenceUrl?: string | null;
};

const KINDS = [
  { value: "oss_repo", label: "OSS overlap" },
  { value: "alma_mater", label: "Alma mater" },
  { value: "ex_employer", label: "Ex-employer" },
  { value: "mutual", label: "Mutual (would vouch)" },
  { value: "conference", label: "Conference" },
  { value: "content", label: "Their writing" },
];

// Per-contact affiliation ledger: the reply trigger the drafts open with.
// Strength 1–3; an OSS overlap you created outranks a shared school.
export default function AffiliationChips({
  contactId,
  affiliations,
}: {
  contactId: string;
  affiliations: AffiliationRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("oss_repo");
  const [detail, setDetail] = useState("");
  const [strength, setStrength] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Link2 size={11} /> affiliations
      </span>
      {affiliations.map((a) => (
        <span
          key={a.id}
          title={`strength ${a.strength}/3`}
          className="inline-flex items-center gap-1 rounded-full border border-brand-300 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300"
        >
          {KINDS.find((k) => k.value === a.kind)?.label ?? a.kind}: {a.detail}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await removeAffiliationAction(a.id);
              })
            }
            className="text-brand-400 hover:text-red-600"
            aria-label="remove affiliation"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-brand-400 hover:text-brand-600"
        >
          <Plus size={11} /> add
        </button>
      ) : (
        <span className="flex flex-wrap items-center gap-1">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded border border-stone-300 bg-transparent px-1 py-0.5 text-[11px]"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder='specific & checkable, e.g. "merged PR #48 in their repo"'
            className="w-64 rounded border border-stone-300 px-1.5 py-0.5 text-[11px]"
          />
          <select
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="rounded border border-stone-300 bg-transparent px-1 py-0.5 text-[11px]"
            title="strength"
          >
            <option value={1}>weak</option>
            <option value={2}>solid</option>
            <option value={3}>strong</option>
          </select>
          <button
            type="button"
            disabled={pending || !detail.trim()}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await addAffiliationAction({
                  contactId,
                  kind,
                  detail: detail.trim(),
                  strength,
                });
                if (!res.ok) setError(res.error);
                else {
                  setDetail("");
                  setAdding(false);
                }
              })
            }
            className="rounded bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            save
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-[11px] text-stone-400 hover:text-stone-600"
          >
            cancel
          </button>
          {error && <span className="text-[11px] text-red-600">{error}</span>}
        </span>
      )}
    </div>
  );
}
