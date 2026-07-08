import { Users2 } from "lucide-react";
import NetworkFinder from "@/components/network-finder";
import { hasHappenstanceKey } from "@/lib/integrations/happenstance/client";

export const dynamic = "force-dynamic";

export default function NetworkPage() {
  return (
    <div className="mx-auto max-w-3xl stagger-load">
      <header className="mb-10">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Users2 size={14} />
          <span className="text-xs font-bold uppercase tracking-widest">
            Warm Network
          </span>
        </div>
        <h1 className="text-4xl font-black tracking-tight text-foreground">
          Who do I know?
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-muted-foreground">
          Natural-language search over your own connections (Happenstance). Ask
          in plain English — &ldquo;who do I know at an AI startup?&rdquo; — and
          save the warm intros worth pursuing into your contacts.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <NetworkFinder companyId={null} hasKey={hasHappenstanceKey()} />
      </div>
    </div>
  );
}
