import { createJobAction } from "@/lib/actions/jobs";
import { ROLE_TYPES, ROLE_TYPE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Plus, Check, Loader2 } from "lucide-react";

const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5";
const inputCls = "w-full rounded-xl border border-border bg-secondary/30 p-3 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50";

export default function JobForm({
  companyNames,
}: {
  companyNames: string[];
}) {
  return (
    <form action={createJobAction} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <span className={labelCls}>Company *</span>
          <input
            name="companyName"
            required
            list="company-names"
            className={inputCls}
            placeholder="e.g. Linear"
          />
          <datalist id="company-names">
            {companyNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div>
          <span className={labelCls}>Role Title *</span>
          <input 
            name="title" 
            required 
            className={inputCls} 
            placeholder="e.g. Product Engineer" 
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <span className={labelCls}>Job URL</span>
          <input 
            name="url" 
            type="url" 
            className={inputCls} 
            placeholder="https://…" 
          />
        </div>
        <div>
          <span className={labelCls}>Role Type</span>
          <select name="roleType" className={inputCls} defaultValue="">
            <option value="">Auto-detect</option>
            {ROLE_TYPES.map((r) => (
              <option key={r} value={r}>
                {r} — {ROLE_TYPE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className={labelCls}>Location</span>
        <input 
          name="location" 
          className={inputCls} 
          placeholder="e.g. Remote / San Francisco" 
        />
      </div>

      <div>
        <span className={labelCls}>Description / Notes</span>
        <textarea 
          name="description" 
          rows={3} 
          className={inputCls} 
          placeholder="Key requirements or personal notes…"
        />
      </div>

      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
      >
        <Plus size={18} strokeWidth={3} />
        Add to Wishlist
      </button>
    </form>
  );
}
