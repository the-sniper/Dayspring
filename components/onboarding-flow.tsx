"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Compass, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ROLE_TYPES, ROLE_TYPE_LABELS, type RoleType } from "@/lib/types";
import { cn } from "@/lib/utils";

const DOMAIN_SUGGESTIONS = [
  "Software engineering",
  "AI & machine learning",
  "Cybersecurity",
  "Data engineering",
  "Mobile development",
  "DevOps & cloud",
  "AR/VR & gaming",
  "Hardware & embedded",
  "Product management",
  "Product design",
];

// Two-step first-run flow: what the user does + what roles they want, then
// which industries to watch. Completion seeds their company list from the
// catalog and kicks off the first job pull (api.onboarding.complete).
export default function OnboardingFlow() {
  const router = useRouter();
  const options = useQuery(api.onboarding.options, {});
  const complete = useMutation(api.onboarding.complete);

  const [step, setStep] = useState<1 | 2>(1);
  const [domain, setDomain] = useState("");
  const [roles, setRoles] = useState<RoleType[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const companyCount = (options?.industries ?? [])
    .filter((i) => industries.includes(i.name))
    .reduce((sum, i) => sum + i.companyCount, 0);

  async function onFinish() {
    setSubmitting(true);
    setError(null);
    try {
      await complete({ domain, industries, roleTypes: roles });
      router.replace("/feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
      setSubmitting(false);
    }
  }

  const chipClass = (selected: boolean) =>
    cn(
      "cursor-pointer rounded-xl border px-4 py-3 text-left text-sm font-bold transition-all active:scale-[0.98]",
      selected
        ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20 dark:bg-brand-950/30 dark:text-brand-300"
        : "border-border bg-card text-foreground hover:border-brand-500/40",
    );

  return (
    <div className="w-full max-w-xl">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/25">
          {step === 1 ? <Compass size={28} strokeWidth={2.2} /> : <Building2 size={28} strokeWidth={2.2} />}
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {step === 1 ? "What do you do?" : "Where do you want to work?"}
        </h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {step === 1
            ? "Tell us your domain and the roles you're after — we'll personalize your feed around it."
            : "Pick the industries to watch. We'll load their companies and pull live openings for you."}
        </p>
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {[1, 2].map((s) => (
            <span
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all",
                s === step ? "w-6 bg-brand-500" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-300/50 bg-rose-50/50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
          {error}
        </div>
      )}

      {step === 1 ? (
        <div className="space-y-6">
          <div>
            <label
              htmlFor="domain"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              Your domain of work
            </label>
            <input
              id="domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. Full-stack product engineering"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DOMAIN_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDomain(s)}
                  className="rounded-lg border border-border bg-secondary/50 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-brand-500/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Roles you're interested in
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ROLE_TYPES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoles((prev) => toggle(prev, r))}
                  className={chipClass(roles.includes(r))}
                >
                  {ROLE_TYPE_LABELS[r]}
                  <span className="mt-0.5 block text-[10px] font-black uppercase tracking-wider opacity-50">
                    {r}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!domain.trim() || roles.length === 0}
            onClick={() => setStep(2)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            Continue <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(options?.industries ?? []).map((i) => (
              <button
                key={i.name}
                type="button"
                onClick={() => setIndustries((prev) => toggle(prev, i.name))}
                className={chipClass(industries.includes(i.name))}
              >
                {i.name}
                <span className="mt-0.5 block text-[10px] font-black uppercase tracking-wider opacity-50">
                  {i.companyCount} companies
                </span>
              </button>
            ))}
            {options === undefined && (
              <p className="col-span-full py-8 text-center text-sm font-medium text-muted-foreground">
                Loading industries…
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground shadow-sm transition-all hover:bg-secondary/80 active:scale-[0.99] disabled:opacity-50"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              type="button"
              disabled={industries.length === 0 || submitting}
              onClick={() => void onFinish()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              <Sparkles size={16} />
              {submitting
                ? "Setting up your workspace…"
                : companyCount > 0
                  ? `Start with ${companyCount} companies`
                  : "Finish setup"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
