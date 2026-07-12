import { Users2, Sparkles, UserPlus } from "lucide-react";
import ContactSearch from "@/components/contact-search";
import NetworkFinder from "@/components/network-finder";
import NewPeopleFinder from "@/components/new-people-finder";
import PageHeader from "@/components/page-header";
import { hasApiKey } from "@/lib/claude/client";
import { CONTACTS_PAGE_SIZE } from "@/lib/contacts/constants";
import { contactsCount, listContacts } from "@/lib/contacts/query";
import { hasApolloKey } from "@/lib/integrations/apollo/client";
import { hasHappenstanceKey } from "@/lib/integrations/happenstance/client";

export const dynamic = "force-dynamic";

export default function NetworkPage() {
  const total = contactsCount();
  const initial = listContacts({ limit: CONTACTS_PAGE_SIZE });

  return (
    <div className="mx-auto max-w-5xl stagger-load">
      <PageHeader
        eyebrow="Warm Network"
        icon={<Users2 size={14} />}
        title="Who do I know?"
        description={
          <>
            Filter instantly, or{" "}
            <span className="font-semibold text-foreground">ask in plain English</span>{" "}
            — &ldquo;recruiters hiring fullstack devs&rdquo; — across your
            LinkedIn connections, Apollo finds, and warm intros.
          </>
        }
      />

      {/* Primary: free local filter + AI ask over saved/imported contacts */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <ContactSearch initial={initial} total={total} hasApiKey={hasApiKey()} />
      </section>

      {/* Find NEW people — Apollo cold-contact discovery from a plain query */}
      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2 text-muted-foreground">
          <UserPlus size={14} />
          <span className="text-xs font-bold uppercase tracking-widest">
            Find new people · Apollo
          </span>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <NewPeopleFinder
            hasApolloKey={hasApolloKey()}
            hasApiKey={hasApiKey()}
          />
        </div>
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
