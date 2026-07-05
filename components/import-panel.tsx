"use client";

import { useRef, useState, useTransition } from "react";
import {
  confirmImportAction,
  parseCsvAction,
  parsePasteAction,
  type ParseActionResult,
} from "@/lib/actions/imports";
import type { PreparedCandidate } from "@/lib/imports/candidates";
import type { JobSource } from "@/lib/types";

type Preview = {
  candidates: PreparedCandidate[];
  warnings: string[];
  source: JobSource;
  checked: boolean[];
};

export default function ImportPanel({ hasKey }: { hasKey: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  function applyParse(res: ParseActionResult) {
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setResult(null);
    setPreview({
      candidates: res.candidates,
      warnings: res.warnings,
      source: res.source,
      // Duplicates default-unchecked.
      checked: res.candidates.map((c) => !c.duplicate),
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4">
        {/* CSV bridge */}
        <form
          className="rounded-lg border border-stone-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => applyParse(await parseCsvAction(fd)));
          }}
        >
          <h2 className="text-sm font-semibold">CSV file</h2>
          <p className="mt-1 text-xs text-stone-500">
            Exports from Simplify / JobRight / MigrateMate. Needs company +
            title columns; status, url, location, notes, date are picked up
            automatically.
          </p>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="mt-3 block w-full text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-3 rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? "Parsing…" : "Parse CSV"}
          </button>
        </form>

        {/* Paste bridge */}
        <form
          className="rounded-lg border border-stone-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const text = pasteRef.current?.value ?? "";
            startTransition(async () => applyParse(await parsePasteAction(text)));
          }}
        >
          <h2 className="text-sm font-semibold">Paste anything</h2>
          <p className="mt-1 text-xs text-stone-500">
            Job digests, emails, copied listings — Claude extracts structured
            records. Nothing is saved until you confirm below.
            {!hasKey && (
              <span className="block font-medium text-red-600">
                Needs ANTHROPIC_API_KEY — see Settings.
              </span>
            )}
          </p>
          <textarea
            ref={pasteRef}
            rows={4}
            placeholder="Paste job listings here…"
            className="mt-3 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={pending || !hasKey}
            className="mt-2 rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? "Parsing…" : "Parse with Claude"}
          </button>
        </form>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {result && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {result}
        </p>
      )}

      {preview && (
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold">
            Preview — {preview.candidates.length} parsed, {preview.checked.filter(Boolean).length} selected
          </h2>
          {preview.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {preview.warnings.map((w) => (
                <li key={w} className="text-xs text-amber-700">
                  ⚠ {w}
                </li>
              ))}
            </ul>
          )}
          {preview.candidates.length > 0 && (
            <>
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left text-xs uppercase tracking-wide text-stone-500">
                    <th className="py-1.5 pr-2" />
                    <th className="py-1.5 pr-3">Company</th>
                    <th className="py-1.5 pr-3">Title</th>
                    <th className="py-1.5 pr-3">Status</th>
                    <th className="py-1.5 pr-3">Location</th>
                    <th className="py-1.5">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.candidates.map((c, i) => (
                    <tr key={i} className="border-b border-stone-100">
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          checked={preview.checked[i]}
                          onChange={(e) => {
                            const checked = [...preview.checked];
                            checked[i] = e.target.checked;
                            setPreview({ ...preview, checked });
                          }}
                        />
                      </td>
                      <td className="py-1.5 pr-3 font-medium">{c.company}</td>
                      <td className="max-w-sm truncate py-1.5 pr-3">{c.title}</td>
                      <td className="py-1.5 pr-3 text-stone-500">{c.status ?? "new"}</td>
                      <td className="max-w-32 truncate py-1.5 pr-3 text-stone-500">
                        {c.location ?? "—"}
                      </td>
                      <td className="py-1.5">
                        {c.duplicate && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                            duplicate
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                disabled={pending || preview.checked.every((c) => !c)}
                onClick={() =>
                  startTransition(async () => {
                    const selected = preview.candidates
                      .filter((_, i) => preview.checked[i])
                      .map(({ duplicate: _d, ...c }) => c);
                    const res = await confirmImportAction(selected, preview.source);
                    if (res.ok) {
                      setResult(
                        `Imported ${res.inserted} job${res.inserted === 1 ? "" : "s"}` +
                          (res.skipped ? `, ${res.skipped} skipped as duplicates.` : "."),
                      );
                      setPreview(null);
                    } else {
                      setError(res.error);
                    }
                  })
                }
                className="mt-4 rounded bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {pending ? "Importing…" : `Import ${preview.checked.filter(Boolean).length} selected`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
