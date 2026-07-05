import { createJobAction } from "@/lib/actions/jobs";
import { ROLE_TYPES, ROLE_TYPE_LABELS } from "@/lib/types";

const input =
  "w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm";

// Manual entry — lands in Wishlist.
export default function JobForm({
  companyNames,
}: {
  companyNames: string[];
}) {
  return (
    <form action={createJobAction} className="grid max-w-xl gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Company *</span>
          <input
            name="companyName"
            required
            list="company-names"
            className={input}
            placeholder="Acme"
          />
          <datalist id="company-names">
            {companyNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Title *</span>
          <input name="title" required className={input} placeholder="Forward Deployed Engineer" />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">URL</span>
          <input name="url" type="url" className={input} placeholder="https://…" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Location</span>
          <input name="location" className={input} placeholder="Remote / SF" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Role type</span>
          <select name="roleType" className={input} defaultValue="">
            <option value="">auto-detect</option>
            {ROLE_TYPES.map((r) => (
              <option key={r} value={r}>
                {r} — {ROLE_TYPE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Description / notes</span>
        <textarea name="description" rows={3} className={input} />
      </label>
      <button
        type="submit"
        className="justify-self-start rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
      >
        Add to wishlist
      </button>
    </form>
  );
}
