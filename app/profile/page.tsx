import Link from "next/link";
import { UserCircle } from "lucide-react";
import PageHeader from "@/components/page-header";
import ProfileStudio, { type ProfileView } from "@/components/profile-studio";
import { completeness, getDefaultProfile, listProfiles, readProfileDoc } from "@/lib/profiles/core";
import { listMasters } from "@/lib/resumes/core";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  // Seeds itself from the legacy Settings blob on first visit.
  const [active, masters, profiles] = await Promise.all([
    getDefaultProfile(),
    listMasters(),
    listProfiles(),
  ]);
  const primary = masters.find((m) => m.isPrimary) ?? masters[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl stagger-load">
      <PageHeader
        eyebrow="Candidate"
        icon={<UserCircle size={14} />}
        title="Profile"
        description="What every application draws from — consolidated from your master resumes, plus the defaults apply-assist fills on ATS forms."
      />

      {active ? (
        <ProfileStudio
          profiles={profiles.map((p) => ({
            id: p.id,
            name: p.name,
            isDefault: p.isDefault,
          }))}
          active={
            {
              id: active.id,
              name: active.name,
              isDefault: active.isDefault,
              fullName: active.fullName,
              headline: active.headline,
              summary: active.summary,
              email: active.email,
              phone: active.phone,
              location: active.location,
              linkedin: active.linkedin,
              github: active.github,
              website: active.website,
              content: active.content,
              // Normalized on read — legacy M27-shape docs migrate here.
              doc: readProfileDoc(active),
              defaults: active.defaults,
            } satisfies ProfileView
          }
          mastersCount={masters.length}
          primaryMaster={
            primary
              ? {
                  id: primary.id,
                  label: primary.label,
                  hasPdf: !!primary.sourceFile?.endsWith(".pdf"),
                }
              : null
          }
          completeness={completeness(active)}
        />
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No profile yet —{" "}
            <Link href="/settings" className="font-bold text-brand-600 hover:underline">
              upload a master resume in Settings
            </Link>{" "}
            and it seeds itself, or paste your resume into the Settings profile
            box.
          </p>
        </div>
      )}
    </div>
  );
}
