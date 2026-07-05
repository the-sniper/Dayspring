import { ATS_TYPES, ROLE_TYPES, type AtsType, type RoleType } from "@/lib/types";

const input =
  "w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm";

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
    <form action={action} className="grid max-w-xl gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Name *</span>
          <input name="name" required defaultValue={values.name ?? ""} className={input} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Domain</span>
          <input name="domain" defaultValue={values.domain ?? ""} className={input} placeholder="acme.com" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">ATS</span>
          <select name="atsType" defaultValue={values.atsType ?? ""} className={input}>
            <option value="">none (not watched)</option>
            {ATS_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">ATS slug</span>
          <input
            name="atsSlug"
            defaultValue={values.atsSlug ?? ""}
            className={input}
            placeholder="e.g. vercel"
          />
        </label>
      </div>
      <fieldset className="text-sm">
        <legend className="mb-1 font-medium">Role types they hire</legend>
        <div className="flex flex-wrap gap-3">
          {ROLE_TYPES.map((r) => (
            <label key={r} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="roleTypes"
                value={r}
                defaultChecked={values.roleTypes?.includes(r) ?? false}
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="visaSponsor"
          defaultChecked={values.visaSponsor ?? false}
        />
        Known visa sponsor
      </label>
      <button
        type="submit"
        className="justify-self-start rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
      >
        {submitLabel}
      </button>
    </form>
  );
}
