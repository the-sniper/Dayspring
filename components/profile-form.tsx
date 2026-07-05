"use client";

import { useActionState } from "react";
import {
  saveProfileAction,
  type SaveProfileState,
} from "@/lib/actions/settings";

const initial: SaveProfileState = { savedAt: null };

export default function ProfileForm({ value }: { value: string }) {
  const [state, formAction, pending] = useActionState(
    saveProfileAction,
    initial,
  );
  return (
    <form action={formAction} className="grid gap-3">
      <textarea
        name="profile"
        defaultValue={value}
        rows={18}
        className="w-full rounded border border-stone-300 bg-white px-3 py-2 font-mono text-sm"
        placeholder="Paste your resume, then add targets: role types, locations, visa needs, comp floor…"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {state.savedAt && !pending && (
          <span className="text-sm text-emerald-700">
            Saved ✓ {new Date(state.savedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
    </form>
  );
}
