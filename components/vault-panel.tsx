"use client";

import { useState, useTransition } from "react";
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Loader2,
  Plus,
  ShieldAlert,
} from "lucide-react";
import {
  addCredentialAction,
  deleteCredentialAction,
  revealCredentialAction,
  setMasterPasswordAction,
} from "@/lib/actions/vault";
import type { CredentialRow } from "@/lib/vault/core";

export default function VaultPanel({
  hasVaultKey,
  hasMaster,
  credentials,
}: {
  hasVaultKey: boolean;
  hasMaster: boolean;
  credentials: CredentialRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [masterInput, setMasterInput] = useState("");
  const [masterSet, setMasterSet] = useState(hasMaster);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  if (!hasVaultKey) {
    return (
      <div className="rounded-2xl border border-border bg-secondary/30 p-6">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert size={18} className="text-rose-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
            Credential Vault
          </h2>
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
            Off
          </span>
        </div>
        <p className="text-xs font-medium text-muted-foreground leading-relaxed">
          Add <code className="text-rose-500">DAYSPRING_VAULT_KEY</code> to
          .env.local to enable encrypted storage of job-site passwords. Without
          it, nothing is stored — Dayspring never keeps a plaintext password.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound size={18} className="text-brand-500" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
          Credential Vault
        </h2>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          Encrypted
        </span>
      </div>

      {/* Master password */}
      <div className="mb-6 rounded-xl border border-border bg-secondary/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={14} className="text-muted-foreground" />
          <h3 className="text-xs font-bold text-foreground">
            Master password
          </h3>
          {masterSet && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              Set
            </span>
          )}
        </div>
        <p className="mb-3 text-[11px] font-medium text-muted-foreground leading-relaxed">
          Set once — every job-site account apply-assist creates uses this
          password. Stored encrypted at rest.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={masterInput}
            onChange={(e) => setMasterInput(e.target.value)}
            placeholder={masterSet ? "Change master password…" : "Set master password…"}
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="button"
            disabled={pending || masterInput.length < 6}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await setMasterPasswordAction(masterInput);
                if (res.ok) {
                  setMasterSet(true);
                  setMasterInput("");
                } else setError(res.error);
              })
            }
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : "Save"}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-xs font-medium text-destructive">{error}</p>}

      {/* Accounts */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-foreground">
          Job-site accounts ({credentials.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowAdd((s) => !s)}
          className="flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400 cursor-pointer"
        >
          <Plus size={14} />
          Add manually
        </button>
      </div>

      {showAdd && (
        <AddCredentialForm
          onDone={() => setShowAdd(false)}
          onError={setError}
        />
      )}

      {credentials.length === 0 ? (
        <p className="text-xs font-medium text-muted-foreground">
          None yet — apply-assist stores them as it creates accounts, or add one
          manually.
        </p>
      ) : (
        <div className="space-y-2">
          {credentials.map((c) => (
            <CredentialRowView key={c.id} cred={c} onError={setError} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddCredentialForm({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (e: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [site, setSite] = useState("");
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const input =
    "w-full rounded-lg border border-border bg-secondary/20 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
  return (
    <div className="mb-3 grid gap-2 rounded-xl border border-border bg-secondary/10 p-3">
      <input className={input} placeholder="Label (e.g. Workday — Nvidia)" value={site} onChange={(e) => setSite(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <input className={input} placeholder="Host (e.g. nvidia.wd5.myworkdayjobs.com)" value={host} onChange={(e) => setHost(e.target.value)} />
        <input className={input} placeholder="Email used" value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <p className="text-[10px] text-muted-foreground">Uses your master password.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              onError(null);
              const res = await addCredentialAction({ site, host, username });
              if (res.ok) onDone();
              else onError(res.error);
            })
          }
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {pending ? "Saving…" : "Store"}
        </button>
        <button type="button" onClick={onDone} className="text-xs font-medium text-muted-foreground cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  );
}

function CredentialRowView({
  cred,
  onError,
}: {
  cred: CredentialRow;
  onError: (e: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{cred.site}</p>
        <p className="truncate text-[11px] font-medium text-muted-foreground">
          {cred.username} · {cred.host}
        </p>
        {revealed && (
          <p className="mt-1 font-mono text-xs text-brand-600 dark:text-brand-400">
            {revealed}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={pending}
          title={revealed ? "Hide" : "Reveal password"}
          onClick={() =>
            startTransition(async () => {
              if (revealed) {
                setRevealed(null);
                return;
              }
              const res = await revealCredentialAction(cred.id);
              if (res.ok) setRevealed(res.password);
              else onError(res.error);
            })
          }
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        {revealed && (
          <button
            type="button"
            title="Copy"
            onClick={() => {
              void navigator.clipboard.writeText(revealed);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-brand-600 hover:bg-secondary transition-colors cursor-pointer"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
        <button
          type="button"
          title="Delete"
          onClick={() =>
            startTransition(async () => {
              await deleteCredentialAction(cred.id);
            })
          }
          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
