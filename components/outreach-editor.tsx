"use client";

import { useMemo, useState, useTransition } from "react";
import {
  deleteDraftAction,
  markSentAction,
  sendOutreachAction,
} from "@/lib/actions/outreach";
import {
  containsFirstName,
  EMAIL_WORD_BAND,
  HUMAN_EDIT_FLOOR_PCT,
  humanEditedPct,
  LINKEDIN_WORD_BAND,
  SUBJECT_WORD_BAND,
  wordCount,
} from "@/shared/outreach-rules";

type Check = { ok: boolean; label: string; blocking?: boolean };

export default function OutreachEditor({
  id,
  initialSubject,
  initialBody,
  aiDraft,
  contactEmail,
  contactName,
  contactLinkedin,
  touchNumber = 1,
  hasAffiliations,
  hasGmail,
}: {
  id: string;
  initialSubject: string;
  initialBody: string;
  aiDraft: string | null;
  contactEmail: string | null;
  contactName: string;
  contactLinkedin: string | null;
  touchNumber?: number;
  hasAffiliations: boolean;
  hasGmail: boolean;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [copiedForLinkedIn, setCopiedForLinkedIn] = useState(false);
  const [pending, startTransition] = useTransition();

  const words = wordCount(body);
  const subjectWords = wordCount(subject);
  const editedPct = useMemo(
    () => (aiDraft ? humanEditedPct(aiDraft, body) : null),
    [aiDraft, body],
  );
  const belowFloor = editedPct !== null && editedPct < HUMAN_EDIT_FLOOR_PCT;
  const firstNameOk = containsFirstName(body, contactName);

  const [emailLo, emailHi] = EMAIL_WORD_BAND;
  const [lnLo, lnHi] = LINKEDIN_WORD_BAND;
  const [subLo, subHi] = SUBJECT_WORD_BAND;

  // Touch 1 gets the full evidence-based band; follow-ups should be short.
  const checks: Check[] = [
    touchNumber === 1
      ? {
          ok: words >= emailLo && words <= emailHi,
          label: `${words} words (best: ${emailLo}–${emailHi} email, ${lnLo}–${lnHi} LinkedIn)`,
        }
      : {
          ok: words > 0 && words <= 60,
          label: `${words} words (touch ${touchNumber}: under 50, add new info — don't repeat the ask)`,
        },
    {
      ok: subjectWords >= subLo && subjectWords <= subHi,
      label: `subject ${subjectWords} words (best: ${subLo}–${subHi})`,
    },
    {
      ok: firstNameOk,
      label: firstNameOk
        ? `greets ${contactName.split(/\s+/)[0]} by name`
        : `first name missing — nearly doubles replies`,
      blocking: true,
    },
  ];
  if (editedPct !== null) {
    checks.push({
      ok: !belowFloor,
      label: `${editedPct}% yours (floor ${HUMAN_EDIT_FLOOR_PCT}% — the draft is scaffolding, rewrite it)`,
      blocking: true,
    });
  }

  const blocked = checks.some((c) => c.blocking && !c.ok);
  const blockedReason = belowFloor
    ? "Rewrite more of this in your own words first"
    : !firstNameOk
      ? "Greet them by first name first"
      : null;

  const mailto = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  return (
    <div className="grid gap-2">
      {!hasAffiliations && touchNumber === 1 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          No shared affiliation with this contact — the single strongest reply
          trigger. Consider creating one first (merge a PR in their repo, cite
          something they wrote), or add one below if it exists.
        </p>
      )}
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm font-medium"
        placeholder="Subject"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={9}
        className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm leading-relaxed"
      />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {checks.map((c) => (
          <span
            key={c.label}
            className={`text-[11px] font-medium ${
              c.ok
                ? "text-emerald-600 dark:text-emerald-400"
                : c.blocking
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {c.ok ? "✓" : c.blocking ? "✕" : "△"} {c.label}
          </span>
        ))}
      </div>
      {editedPct !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div
            className={`h-full transition-all ${belowFloor ? "bg-red-400" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, editedPct)}%` }}
          />
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {hasGmail && contactEmail ? (
          <button
            type="button"
            disabled={pending || blocked}
            title={blockedReason ?? undefined}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await sendOutreachAction(id, subject, body);
                if (!res.ok) setError(res.error);
              })
            }
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {pending ? "Sending…" : `Send via Gmail → ${contactEmail}`}
          </button>
        ) : (
          <>
            {mailto ? (
              <a
                href={blocked ? undefined : mailto}
                aria-disabled={blocked}
                title={blockedReason ?? undefined}
                className={`rounded border border-stone-300 px-3 py-1.5 text-sm font-medium ${blocked ? "cursor-not-allowed opacity-50" : "hover:bg-stone-100"}`}
              >
                Open in mail app
              </a>
            ) : !contactLinkedin ? (
              <span className="text-xs text-red-600">
                No email for this contact — reveal one via Apollo first.
              </span>
            ) : null}
            {mailto && (
              <button
                type="button"
                disabled={pending || blocked}
                title={blockedReason ?? undefined}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const res = await markSentAction(id, subject, body, "email");
                    if (!res.ok) setError(res.error);
                  })
                }
                className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-50"
              >
                Mark sent
              </button>
            )}
          </>
        )}
        {copiedForLinkedIn && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await markSentAction(id, subject, body, "linkedin");
                if (!res.ok) setError(res.error);
              })
            }
            className="rounded border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          >
            I sent it on LinkedIn
          </button>
        )}
        {contactLinkedin && (
          // Draft-and-queue boundary: DaySpring never auto-sends on LinkedIn.
          // Copy the body, open the profile, you paste and hit send yourself.
          <button
            type="button"
            disabled={blocked}
            title={blockedReason ?? undefined}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(body);
              } catch {
                // Clipboard can be denied; the profile still opens.
              }
              setCopiedForLinkedIn(true);
              window.open(contactLinkedin, "_blank", "noopener");
            }}
            className="rounded border border-sky-300 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-950/40"
          >
            {copiedForLinkedIn ? "Copied — paste it there" : "Copy & open LinkedIn"}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await deleteDraftAction(id);
              if (!res.ok) setError(res.error);
            })
          }
          className="ml-auto text-xs text-stone-400 hover:text-red-600"
        >
          delete draft
        </button>
      </div>
    </div>
  );
}
