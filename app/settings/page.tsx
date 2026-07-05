import path from "node:path";
import { eq } from "drizzle-orm";
import ProfileForm from "@/components/profile-form";
import { MODEL_CHEAP, MODEL_SCORE } from "@/lib/claude/client";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = db
    .select()
    .from(settings)
    .where(eq(settings.key, "profile"))
    .get();
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const dbPath =
    process.env.DAYSPRING_DB_PATH ??
    path.join(process.cwd(), "data", "dayspring.db");

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-stone-500">
          Everything scoring judges against: resume + targets (role types,
          locations, visa needs, comp floor). Scores are only as good as this
          text.
          {profile?.updatedAt && (
            <span className="text-stone-400">
              {" "}
              Last saved {profile.updatedAt.slice(0, 16).replace("T", " ")}.
            </span>
          )}
        </p>
        <div className="mt-3">
          <ProfileForm value={profile?.value ?? ""} />
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">Environment</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-stone-600">
          <dt className="font-medium">Anthropic API key</dt>
          <dd>
            {hasKey ? (
              <span className="text-emerald-700">set ✓</span>
            ) : (
              <span className="text-red-600">
                missing — add ANTHROPIC_API_KEY to .env.local (scoring,
                paste-parse, and role classification stay off until then)
              </span>
            )}
          </dd>
          <dt className="font-medium">Database</dt>
          <dd className="font-mono text-xs leading-5">{dbPath}</dd>
          <dt className="font-medium">Scoring model</dt>
          <dd className="font-mono text-xs leading-5">
            {MODEL_SCORE} <span className="font-sans text-stone-400">(~$0.02–0.03/job)</span>
          </dd>
          <dt className="font-medium">Parse/classify model</dt>
          <dd className="font-mono text-xs leading-5">
            {MODEL_CHEAP} <span className="font-sans text-stone-400">(sub-cent per call)</span>
          </dd>
        </dl>
      </section>
    </div>
  );
}
