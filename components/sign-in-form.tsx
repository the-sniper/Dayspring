"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogIn, Mail, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "signIn" | "signUp";

export default function SignInForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [step, setStep] = useState<Step>("signIn");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("flow", step);
    try {
      const result = await signIn("password", formData);
      if (result.redirect) return; // OAuth redirect — shouldn't happen here
      if (result.signingIn) router.push("/");
      else setError("Couldn't sign in — check your email and password.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : step === "signUp"
            ? "Sign up failed — that email may already be registered."
            : "Invalid email or password.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setLoading(true);
    setError(null);
    try {
      await signIn("google");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Google sign-in failed — is AUTH_GOOGLE_ID set on the Convex deployment?",
      );
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/25">
          <LogIn size={28} strokeWidth={2.2} />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {step === "signIn" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {step === "signIn"
            ? "Sign in to your job search command center."
            : "Your pipeline, profile, and settings stay private to you."}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-300/50 bg-rose-50/50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => void onGoogle()}
        disabled={loading}
        className={cn(
          "flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground shadow-sm transition-all hover:bg-secondary/80 active:scale-[0.99] disabled:opacity-50",
        )}
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
          or
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={(e) => void onPasswordSubmit(e)} className="space-y-4">
        {step === "signUp" && (
          <div>
            <label htmlFor="name" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="Areef Syed"
              className={inputClass}
            />
          </div>
        )}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={step === "signUp" ? "new-password" : "current-password"}
            placeholder="At least 8 characters"
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
        >
          {step === "signIn" ? (
            <>
              <Mail size={16} /> Sign in
            </>
          ) : (
            <>
              <UserPlus size={16} /> Create account
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm font-medium text-muted-foreground">
        {step === "signIn" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setStep(step === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
          className="font-bold text-brand-600 hover:underline dark:text-brand-400"
        >
          {step === "signIn" ? "Create an account" : "Sign in instead"}
        </button>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
