"use client";

import { useState, useTransition } from "react";
import {
  deleteDraftAction,
  markSentAction,
  sendOutreachAction,
} from "@/lib/actions/outreach";

export default function OutreachEditor({
  id,
  initialSubject,
  initialBody,
  contactEmail,
  hasGmail,
}: {
  id: string;
  initialSubject: string;
  initialBody: string;
  contactEmail: string | null;
  hasGmail: boolean;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mailto = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  return (
    <div className="grid gap-2">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm font-medium"
        placeholder="Subject"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={7}
        className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm leading-relaxed"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        {hasGmail && contactEmail ? (
          <button
            type="button"
            disabled={pending}
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
                href={mailto}
                className="rounded border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
              >
                Open in mail app
              </a>
            ) : (
              <span className="text-xs text-red-600">
                No email for this contact — reveal one via Apollo first.
              </span>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await markSentAction(id, subject, body);
                  if (!res.ok) setError(res.error);
                })
              }
              className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 disabled:opacity-50"
            >
              Mark sent
            </button>
          </>
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
