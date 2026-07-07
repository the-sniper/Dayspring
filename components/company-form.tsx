import { ATS_TYPES, ROLE_TYPES, type AtsType, type RoleType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Plus, Check, Building2, Globe, Database, ShieldCheck } from "lucide-react";

const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5";
const inputCls = "w-full rounded-xl border border-border bg-secondary/30 p-3 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50";

type CompanyValues = {
  name?: string;
  domain?: string | null;
  atsType?: AtsType | null;
  atsSlug?: string | null;
  roleTypes?: RoleType[] | null;
  visaSponsor?: boolean;
};

export default function CompanyForm({
  action,
  values = {},
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values?: CompanyValues;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <span className={labelCls}>Company Name *</span>
          <div className="relative">
            <input 
              name="name" 
              required 
              defaultValue={values.name ?? ""} 
              className={cn(inputCls, "pl-10")} 
              placeholder="e.g. Linear"
            />
            <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          </div>
        </div>
        <div>
          <span className={labelCls}>Domain</span>
          <div className="relative">
            <input 
              name="domain" 
              defaultValue={values.domain ?? ""} 
              className={cn(inputCls, "pl-10")} 
              placeholder="acme.com" 
            />
            <Globe size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <span className={labelCls}>ATS Provider</span>
          <div className="relative">
            <select 
              name="atsType" 
              defaultValue={values.atsType ?? ""} 
              className={cn(inputCls, "pl-10 appearance-none cursor-pointer")}
            >
              <option value="">None (Not Watched)</option>
              {ATS_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </option>
              ))}
            </select>
            <Database size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          </div>
        </div>
        <div>
          <span className={labelCls}>ATS Board Slug</span>
          <input
            name="atsSlug"
            defaultValue={values.atsSlug ?? ""}
            className={inputCls}
            placeholder="e.g. vercel"
          />
        </div>
      </div>

      <div>
        <span className={labelCls}>Hiring Roles</span>
        <div className="flex flex-wrap gap-2">
          {ROLE_TYPES.map((r) => (
            <label 
              key={r} 
              className="group flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2 transition-all hover:border-brand-500/50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/50 dark:has-[:checked]:bg-brand-950/20"
            >
              <input
                type="checkbox"
                name="roleTypes"
                value={r}
                defaultChecked={values.roleTypes?.includes(r) ?? false}
                className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground group-has-[:checked]:text-brand-600 dark:group-has-[:checked]:text-brand-400">{r}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="group flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-secondary/10 p-4 transition-all hover:border-emerald-500/50 has-[:checked]:border-emerald-500/50 has-[:checked]:bg-emerald-50/30 dark:has-[:checked]:bg-emerald-950/10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          <ShieldCheck size={20} strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground group-has-[:checked]:text-emerald-600 dark:group-has-[:checked]:text-emerald-400 transition-colors">Visa Sponsorship</p>
          <p className="text-xs font-medium text-muted-foreground">This company is known to sponsor work visas.</p>
        </div>
        <input
          type="checkbox"
          name="visaSponsor"
          defaultChecked={values.visaSponsor ?? false}
          className="h-5 w-5 rounded-md border-border text-emerald-500 focus:ring-emerald-500 cursor-pointer"
        />
      </label>

      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
      >
        <Check size={18} strokeWidth={3} />
        {submitLabel}
      </button>
    </form>
  );
}
