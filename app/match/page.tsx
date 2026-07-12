import { Gauge } from "lucide-react";
import PageHeader from "@/components/page-header";
import ResumeMatch from "@/components/resume-match";
import { hasApiKey } from "@/lib/claude/client";
import { api, convex } from "@/lib/convex/server";
import { listProfiles } from "@/lib/profiles/core";
import { listMasters } from "@/lib/resumes/core";

export const dynamic = "force-dynamic";

export default async function MatchPage() {
  const [profileRows, masterRows, savedJobsRaw] = await Promise.all([
    listProfiles(),
    listMasters(),
    // Newest jobs with a non-empty JD (server-side), to prefill the textarea.
    convex().query(api.jobs.savedForMatch, { limit: 150 }),
  ]);
  const profiles = profileRows.map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
  }));
  const masters = masterRows.map((m) => ({
    id: m.id,
    label: m.label,
    isPrimary: m.isPrimary,
  }));

  const savedJobs = savedJobsRaw.map((j) => ({
    id: j.id,
    title: j.title,
    companyName: j.companyName,
    description: j.description,
  }));

  return (
    <div className="mx-auto max-w-5xl stagger-load">
      <PageHeader
        eyebrow="Resume Match"
        icon={<Gauge size={14} />}
        title="Score my resume"
        description={
          <>
            Paste a job description and pick a resume (or upload one) to see how
            well it matches — what&apos;s strong, what&apos;s missing, and how to
            fix it. Then align and download an improved resume.
          </>
        }
      />

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <ResumeMatch
          profiles={profiles}
          masters={masters}
          savedJobs={savedJobs}
          hasApiKey={await hasApiKey()}
        />
      </section>
    </div>
  );
}
