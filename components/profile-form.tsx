"use client";

import { useActionState } from "react";
import {
  saveProfileAction,
  type SaveProfileState,
} from "@/lib/actions/settings";
import { Check, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const initial: SaveProfileState = { savedAt: null };

export default function ProfileForm({ value }: { value: string }) {
  const [state, formAction, pending] = useActionState(
    saveProfileAction,
    initial,
  );
  
  return (
    <form action={formAction} className="space-y-4">
      <textarea
        name="profile"
        defaultValue={value}
        rows={15}
        className="w-full rounded-2xl border border-border bg-secondary/30 p-4 font-mono text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        placeholder="Paste your resume and specify your targets (role types, locations, visa needs, comp floor). The higher the quality of this text, the more accurate your match scores will be."
      />
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {pending ? "Saving…" : "Save Profile"}
        </button>
        {state.savedAt && !pending && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <Check size={14} strokeWidth={3} />
            <span>Changes Saved</span>
          </div>
        )}
      </div>
    </form>
  );
}
