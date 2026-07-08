import ImportPanel from "@/components/import-panel";
import LinkedinImportPanel from "@/components/linkedin-import-panel";
import { Download, Users2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-5xl stagger-load">
      <header className="mb-10">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Download size={14} />
          <span className="text-xs font-bold uppercase tracking-widest">Data Bridge</span>
        </div>
        <h1 className="text-4xl font-black tracking-tight text-foreground">
          Import
        </h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground max-w-2xl">
          Bring your job search data from other platforms. Review the extracted records before confirming the import to your command center.
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Jobs
        </h2>
        <ImportPanel hasKey={!!process.env.ANTHROPIC_API_KEY} />
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
