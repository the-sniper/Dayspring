import { Gauge } from "lucide-react";
import { desc, eq, ne } from "drizzle-orm";
import PageHeader from "@/components/page-header";
import ResumeMatch from "@/components/resume-match";
import { hasApiKey } from "@/lib/claude/client";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";
import { listProfiles } from "@/lib/profiles/core";
import { listMasters } from "@/lib/resumes/core";

export const dynamic = "force-dynamic";

export default function MatchPage() {
  const profiles = listProfiles().map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
  }));
  const masters = listMasters().map((m) => ({
    id: m.id,
    label: m.label,
    isPrimary: m.isPrimary,
  }));

  // Light saved-job list to optionally prefill the JD textarea.
  const savedJobs = db
    .select({
      id: jobs.id,
      title: jobs.title,
      companyName: companies.name,
      description: jobs.description,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(ne(jobs.description, ""))
    .orderBy(desc(jobs.id))
    .limit(150)
    .all()
    .map((j) => ({
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
          hasApiKey={hasApiKey()}
        />
      </section>
    </div>
  );
}
