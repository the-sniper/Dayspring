import type { RoleType } from "@/lib/types";

const colors: Record<RoleType, string> = {
  FDE: "bg-purple-100 text-purple-800",
  FE: "bg-sky-100 text-sky-800",
  BE: "bg-orange-100 text-orange-800",
  FS: "bg-teal-100 text-teal-800",
  DATA: "bg-rose-100 text-rose-800",
};

export default function RoleChip({ role }: { role: RoleType | null }) {
  if (!role) {
    return <span className="text-xs text-stone-400">—</span>;
  }
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${colors[role]}`}
    >
      {role}
    </span>
  );
}
