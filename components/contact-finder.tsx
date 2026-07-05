"use client";

import { useState, useTransition } from "react";
import {
  deleteContactAction,
  enrichContactAction,
  saveContactAction,
  searchApolloAction,
  type ApolloSearchResult,
} from "@/lib/actions/contacts";
import type { ApolloPerson } from "@/lib/integrations/apollo/search";

type SavedContact = {
  id: number;
  name: string;
  title: string | null;
  email: string | null;
  linkedin: string | null;
  emailStatus: string | null;
  outreachStatus: string;
};

export default function ContactFinder({
  companyId,
  defaultTitles,
  savedContacts,
  hasApolloKey,
  domainSet,
}: {
  companyId: number;
  defaultTitles: string[];
  savedContacts: SavedContact[];
  hasApolloKey: boolean;
  domainSet: boolean;
}) {
  const [titles, setTitles] = useState(defaultTitles.join(", "));
  const [result, setResult] = useState<ApolloSearchResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled = !hasApolloKey || !domainSet;

  function search(page = 1) {
    startTransition(async () => {
      setMessage(null);
      setResult(
        await searchApolloAction(
          companyId,
          titles.split(",").map((t) => t.trim()),
          page,
        ),
      );
    });
  }

  return (
    <div className="grid gap-4">
      {/* Search — Apollo people search is credit-free */}
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Find contacts (Apollo)</h3>
        <p className="mt-1 text-xs text-stone-500">
          Searching is free; revealing an email costs 1 Apollo credit.
          {!hasApolloKey && (
            <span className="block font-medium text-red-600">
              Needs APOLLO_API_KEY in .env.local.
            </span>
          )}
          {hasApolloKey && !domainSet && (
            <span className="block font-medium text-red-600">
              Set this company&apos;s domain first — Apollo searches by domain.
            </span>
          )}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={titles}
            onChange={(e) => setTitles(e.target.value)}
            placeholder="technical recruiter, engineering manager…"
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={pending || disabled}
            onClick={() => search(1)}
            className="shrink-0 rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? "Searching…" : "Search"}
          </button>
        </div>

        {result && !result.ok && (
          <p className="mt-3 text-sm text-red-600">{result.error}</p>
        )}
        {result?.ok && (
          <div className="mt-3">
            <p className="text-xs text-stone-500">
              {result.totalEntries} match{result.totalEntries === 1 ? "" : "es"}
              {result.totalPages > 1 &&
                ` · page ${result.page}/${result.totalPages}`}
            </p>
            <table className="mt-2 w-full border-collapse text-sm">
              <tbody>
                {result.people.map((p) => (
                  <tr key={p.apolloId} className="border-b border-stone-100">
                    <td className="py-1.5 pr-3 font-medium">{p.name}</td>
                    <td className="max-w-56 truncate py-1.5 pr-3 text-stone-600">
                      {p.title ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      {p.linkedinUrl && (
                        <a
                          href={p.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-amber-700 hover:underline"
                        >
                          linkedin ↗
                        </a>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {p.saved ? (
                        <span className="text-xs text-stone-400">saved</span>
                      ) : (
                        <SaveButton companyId={companyId} person={p} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.totalPages > result.page && (
              <button
                type="button"
                disabled={pending}
                onClick={() => search(result.page + 1)}
                className="mt-2 text-xs text-amber-700 hover:underline"
              >
                next page →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Saved contacts */}
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-semibold">
          Saved contacts ({savedContacts.length})
        </h3>
        {message && <p className="mt-2 text-xs text-red-600">{message}</p>}
        {savedContacts.length === 0 ? (
          <p className="mt-2 text-sm text-stone-400">
            None yet — search above and save the people worth a warm intro.
          </p>
        ) : (
          <table className="mt-2 w-full border-collapse text-sm">
            <tbody>
              {savedContacts.map((c) => (
                <tr key={c.id} className="border-b border-stone-100">
                  <td className="py-1.5 pr-3 font-medium">{c.name}</td>
                  <td className="max-w-48 truncate py-1.5 pr-3 text-stone-600">
                    {c.title ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    {c.email ? (
                      <span className="font-mono text-xs">{c.email}</span>
                    ) : c.emailStatus === "unavailable" ? (
                      <span className="text-xs text-stone-400">no email available</span>
                    ) : (
                      <EnrichButton
                        contactId={c.id}
                        onError={(e) => setMessage(e)}
                      />
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    {c.linkedin && (
                      <a
                        href={c.linkedin}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-amber-700 hover:underline"
                      >
                        linkedin ↗
                      </a>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await deleteContactAction(c.id);
                          setMessage(res.ok ? null : res.error);
                        })
                      }
                      className="text-xs text-stone-400 hover:text-red-600"
                    >
                      remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SaveButton({
  companyId,
  person,
}: {
  companyId: number;
  person: ApolloPerson;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  return saved ? (
    <span className="text-xs text-emerald-700">saved ✓</span>
  ) : (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await saveContactAction(companyId, person);
          if (res.ok) setSaved(true);
        })
      }
      className="rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100 disabled:opacity-50"
    >
      {pending ? "…" : "Save"}
    </button>
  );
}

function EnrichButton({
  contactId,
  onError,
}: {
  contactId: number;
  onError: (e: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title="Consumes 1 Apollo credit"
      onClick={() =>
        startTransition(async () => {
          const res = await enrichContactAction(contactId);
          if (!res.ok) onError(res.error);
        })
      }
      className="rounded border border-amber-600 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
    >
      {pending ? "Revealing…" : "Reveal email (1 credit)"}
    </button>
  );
}
