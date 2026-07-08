import { Users2, Sparkles } from "lucide-react";
import ContactSearch from "@/components/contact-search";
import NetworkFinder from "@/components/network-finder";
import { contactsCount, listContacts } from "@/lib/contacts/query";
import { hasHappenstanceKey } from "@/lib/integrations/happenstance/client";

export const dynamic = "force-dynamic";

export default function NetworkPage() {
  const total = contactsCount();
  const initial = listContacts({ limit: 60 });

  return (
    <div className="mx-auto max-w-3xl stagger-load">
      <header className="mb-8">
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
          Search your saved &amp; imported contacts instantly — free. Your
          LinkedIn connections, Apollo finds, and warm intros all live here.
        </p>
      </header>

      {/* Primary: free local search over saved/imported contacts */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <ContactSearch initial={initial} total={total} />
      </section>

      {/* Secondary: Happenstance cloud graph (optional, credit-metered) */}
      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2 text-muted-foreground">
          <Sparkles size={14} />
          <span className="text-xs font-bold uppercase tracking-widest">
            Deeper search · Happenstance
          </span>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="mb-4 text-xs font-medium text-muted-foreground leading-relaxed">
            Happenstance does semantic search over accounts you connect at{" "}
            <a
              href="https://happenstance.ai"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-brand-600 hover:underline"
            >
              happenstance.ai
            </a>{" "}
            (Gmail, LinkedIn, X, calendar) — a <em>separate</em> graph from the
            contacts above. If results come back empty, connect your accounts
            there first.
          </p>
          <NetworkFinder companyId={null} hasKey={hasHappenstanceKey()} />
        </div>
      </section>
    </div>
  );
}
