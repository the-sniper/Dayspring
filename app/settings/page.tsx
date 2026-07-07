import path from "node:path";
import { eq } from "drizzle-orm";
import { 
  Settings, 
  UserCircle, 
  Cpu, 
  Key, 
  Mail, 
  Database, 
  Zap,
  Info
} from "lucide-react";
import ProfileForm from "@/components/profile-form";
import { MODEL_CHEAP, MODEL_SCORE } from "@/lib/claude/client";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { hasApolloKey } from "@/lib/integrations/apollo/client";
import { getGmailConfig, hasGmailEnv } from "@/lib/integrations/gmail/client";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = db
    .select()
    .from(settings)
    .where(eq(settings.key, "profile"))
    .get();
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const gmail = getGmailConfig();
  const dbPath =
    process.env.DAYSPRING_DB_PATH ??
    path.join(process.cwd(), "data", "dayspring.db");

  return (
    <div className="mx-auto max-w-4xl stagger-load">
      <header className="mb-10">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Settings size={14} />
          <span className="text-xs font-bold uppercase tracking-widest">Configuration</span>
        </div>
        <h1 className="text-4xl font-black tracking-tight text-foreground">
          Settings
        </h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
                <UserCircle size={24} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Candidate Profile</h2>
                <p className="text-xs font-medium text-muted-foreground">
                  The context used to score and classify jobs.
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                Paste your resume and specify your targets (role types, locations, visa needs, comp floor). The higher the quality of this text, the more accurate your match scores will be.
              </p>
              <ProfileForm value={profile?.value ?? ""} />
              {profile?.updatedAt && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Last updated {profile.updatedAt.slice(0, 16).replace("T", " ")}
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={16} className="text-muted-foreground" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Environment</h2>
            </div>
            
            <div className="space-y-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Anthropic</span>
                  {hasKey ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">Active</span>
                  ) : (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">Missing</span>
                  )}
                </div>
                {!hasKey && (
                  <p className="text-[10px] font-medium text-muted-foreground leading-normal">
                    Add <code className="text-rose-500">ANTHROPIC_API_KEY</code> to enable scoring and AI parsing.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Apollo</span>
                  {hasApolloKey() ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">Active</span>
                  ) : (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">Missing</span>
                  )}
                </div>
                {!hasApolloKey() && (
                  <p className="text-[10px] font-medium text-muted-foreground leading-normal">
                    Add <code className="text-rose-500">APOLLO_API_KEY</code> to enable contact discovery.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gmail</span>
                  {gmail ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">Connected</span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">Setup</span>
                  )}
                </div>
                {gmail ? (
                  <p className="text-[10px] font-medium text-muted-foreground truncate">
                    {gmail.email}
                  </p>
                ) : (
                  <p className="text-[10px] font-medium text-muted-foreground leading-normal">
                    Run <code className="text-amber-600">npm run gmail:auth</code> to connect your outreach inbox.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-secondary/30 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Info size={16} className="text-muted-foreground" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">System Info</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Database</span>
                <p className="font-mono text-[10px] text-muted-foreground break-all bg-card p-2 rounded-lg border border-border">
                  {dbPath}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Scoring</span>
                  <p className="font-mono text-[10px] text-foreground font-bold">{MODEL_SCORE.split('-').slice(0, 2).join('-')}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Parsing</span>
                  <p className="font-mono text-[10px] text-foreground font-bold">{MODEL_CHEAP.split('-').slice(0, 2).join('-')}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
