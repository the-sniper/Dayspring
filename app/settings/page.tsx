import fs from "node:fs";
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
import ApiKeysPanel, { type KeyRowView } from "@/components/api-keys-panel";
import AutomationPanel from "@/components/automation-panel";
import MasterResumesPanel from "@/components/master-resumes-panel";
import ProfileForm from "@/components/profile-form";
import ResumePathForm from "@/components/resume-path-form";
import VaultPanel from "@/components/vault-panel";
import { dailyRunStatusAction } from "@/lib/actions/automation";
import { listMasters } from "@/lib/resumes/core";
import { hasVaultKey } from "@/lib/vault/crypto";
import { hasMasterPassword, listCredentials } from "@/lib/vault/core";
import { MODEL_CHEAP, MODEL_SCORE, hasApiKey } from "@/lib/claude/client";
import { db } from "@/lib/db";
import { profiles, settings } from "@/lib/db/schema";
import { hasApolloKey } from "@/lib/integrations/apollo/client";
import { hasHappenstanceKey } from "@/lib/integrations/happenstance/client";
import { getGmailConfig, hasGmailEnv } from "@/lib/integrations/gmail/client";
import { hasSavedKey, keySource } from "@/lib/keys";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KEY_ROWS: Omit<KeyRowView, "source" | "hasSaved">[] = [
  {
    name: "ANTHROPIC_API_KEY",
    label: "Anthropic",
    purpose: "Scoring, tailoring, resumes, research, outreach drafts",
    getUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    name: "APOLLO_API_KEY",
    label: "Apollo",
    purpose: "Contact discovery + email reveal",
    getUrl: "https://app.apollo.io/#/settings/integrations/api",
  },
  {
    name: "HAPPENSTANCE_API_KEY",
    label: "Happenstance",
    purpose: "Warm-network search over your connected accounts",
    getUrl: "https://happenstance.ai",
  },
  {
    name: "GOOGLE_CLIENT_ID",
    label: "Google client ID",
    purpose: "Gmail connect (Desktop OAuth client)",
    getUrl: "https://console.cloud.google.com/apis/credentials",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    label: "Google client secret",
    purpose: "Gmail connect (Desktop OAuth client)",
    getUrl: "https://console.cloud.google.com/apis/credentials",
  },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; gmailError?: string }>;
}) {
  const { gmail: gmailOk, gmailError } = await searchParams;
  const profile = db
    .select()
    .from(settings)
    .where(eq(settings.key, "profile"))
    .get();
  // Once a profile row exists, the Profile page owns this — the legacy
  // textarea would edit a dead settings blob.
  const hasProfileRow = db.select().from(profiles).get() !== undefined;
  const hasKey = hasApiKey();
  const gmail = getGmailConfig();
  const resumePath =
    db.select().from(settings).where(eq(settings.key, "resumePath")).get()?.value ??
    "";
  const resumeExists = resumePath ? fs.existsSync(resumePath) : false;
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

      {(gmailOk || gmailError) && (
        <div
          className={cn(
            "mb-6 rounded-xl border p-4 text-sm font-bold",
            gmailOk
              ? "border-emerald-300/50 bg-emerald-50/50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400"
              : "border-rose-300/50 bg-rose-50/50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400",
          )}
        >
          {gmailOk ? `Gmail ${gmailOk.replaceAll("+", " ")} ✓` : `Gmail: ${gmailError}`}
        </div>
      )}

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
              {hasProfileRow ? (
                <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                  Your profile now lives on the{" "}
                  <a href="/profile" className="font-bold text-brand-600 hover:underline">
                    Profile page
                  </a>{" "}
                  — contact details, consolidated resume content, and the
                  application defaults apply-assist fills. Scoring and tailoring
                  read the default profile there.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                    Paste your resume and specify your targets (role types, locations, visa needs, comp floor). The higher the quality of this text, the more accurate your match scores will be.
                  </p>
                  <ProfileForm value={profile?.value ?? ""} />
                  {profile?.updatedAt && (
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      Last updated {profile.updatedAt.slice(0, 16).replace("T", " ")}
                    </p>
                  )}
                </>
              )}
            </div>
          </section>

          <ApiKeysPanel
            keys={KEY_ROWS.map((k) => ({
              ...k,
              source: keySource(k.name as Parameters<typeof keySource>[0]),
              hasSaved: hasSavedKey(k.name as Parameters<typeof hasSavedKey>[0]),
            }))}
          />

          <MasterResumesPanel
            masters={listMasters().map((m) => ({
              id: m.id,
              label: m.label,
              content: m.content,
              isPrimary: m.isPrimary,
              isPdf: !!m.sourceFile?.endsWith(".pdf"),
              updatedAt: m.updatedAt,
            }))}
            hasApiKey={hasKey}
          />

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-foreground">
              Apply-assist
            </h2>
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              Fallback resume path — used only when a job has neither a tailored
              resume nor a primary master PDF.
            </p>
            <ResumePathForm value={resumePath} exists={resumeExists} />
          </section>

          <VaultPanel
            hasVaultKey={hasVaultKey()}
            hasMaster={hasMasterPassword()}
            credentials={listCredentials()}
          />
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
                    Paste your <code className="text-rose-500">Anthropic</code> key in API Keys to enable scoring and AI parsing.
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
                    Paste your <code className="text-rose-500">Apollo</code> key in API Keys to enable contact discovery.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Happenstance</span>
                  {hasHappenstanceKey() ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">Active</span>
                  ) : (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">Missing</span>
                  )}
                </div>
                {!hasHappenstanceKey() && (
                  <p className="text-[10px] font-medium text-muted-foreground leading-normal">
                    Paste your <code className="text-rose-500">Happenstance</code> key in API Keys to search your warm network.
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
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-medium text-muted-foreground truncate">
                      {gmail.email}
                    </p>
                    <a
                      href="/api/gmail/auth"
                      className="shrink-0 text-[10px] font-bold text-brand-600 hover:underline"
                    >
                      Reconnect
                    </a>
                  </div>
                ) : hasGmailEnv() ? (
                  <a
                    href="/api/gmail/auth"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground transition-all hover:scale-105 active:scale-95"
                  >
                    <Mail size={12} />
                    Connect Gmail
                  </a>
                ) : (
                  <p className="text-[10px] font-medium text-muted-foreground leading-normal">
                    Paste the Google client ID + secret in API Keys, then connect here.
                  </p>
                )}
              </div>
            </div>
          </section>

          <AutomationPanel initial={await dailyRunStatusAction()} />

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
