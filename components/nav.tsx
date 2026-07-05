import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/feed", label: "Feed" },
  { href: "/board", label: "Board" },
  { href: "/import", label: "Import" },
  { href: "/companies", label: "Companies" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-stone-200 bg-white px-4 py-6">
      <Link href="/" className="mb-8 flex items-center gap-2 px-2">
        <span className="text-lg" aria-hidden>
          🌅
        </span>
        <span className="text-lg font-semibold tracking-tight">Dayspring</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md px-2 py-1.5 text-sm font-medium text-stone-600 hover:bg-amber-50 hover:text-stone-900"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="mt-auto px-2 text-xs text-stone-400">
        warmer, not more.
      </p>
    </aside>
  );
}
