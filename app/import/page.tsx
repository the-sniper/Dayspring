import { hasApiKey } from "@/lib/claude/client";
import ImportPanel from "@/components/import-panel";
import LinkedinImportPanel from "@/components/linkedin-import-panel";
import PageHeader from "@/components/page-header";
import { Download, Users2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const hasKey = await hasApiKey();
  return (
    <div className="mx-auto max-w-5xl stagger-load">
      <PageHeader
        eyebrow="Data Bridge"
        icon={<Download size={14} />}
        title="Import"
        description="Bring your job search data from other platforms. Review the extracted records before confirming the import to your command center."
      />

      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Jobs
        </h2>
        <ImportPanel hasKey={hasKey} />
      </section>

      <section className="mt-14">
        <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Users2 size={14} />
          Contacts
        </h2>
        <LinkedinImportPanel />
      </section>
    </div>
  );
}
