import { Target } from "lucide-react";
import PageHeader from "@/components/page-header";
import ReachWorkspace from "@/components/reach-workspace";
import { hasApiKey } from "@/lib/claude/client";
import { hasApolloKey } from "@/lib/integrations/apollo/client";
import { getProfile } from "@/lib/jobs/score";

export const dynamic = "force-dynamic";

export default async function ReachPage() {
  const [apiKey, apolloKey, profile] = await Promise.all([
    hasApiKey(),
    hasApolloKey(),
    getProfile(),
  ]);

  return (
    <div className="mx-auto max-w-6xl stagger-load">
      <PageHeader
        eyebrow="Hiring team"
        icon={<Target size={14} />}
        title="Reach"
        description={
          <>
            Paste a job link. Dayspring finds recruiters, hiring managers, and
            points of contact, then drafts{" "}
            <span className="font-semibold text-foreground">
              Cold DMs, Warm DMs, Email, and LinkedIn
            </span>{" "}
            messages tailored to the role and each person.
          </>
        }
      />
      <ReachWorkspace
        hasApiKey={apiKey}
        hasApolloKey={apolloKey}
        hasProfile={profile !== null}
      />
    </div>
  );
}
