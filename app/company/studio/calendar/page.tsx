import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import PageHeader from "@/components/page-header";
import ContentCalendarView from "@/components/content-calendar-view";
import { todayDate } from "@/lib/orchestra/types";

export const dynamic = "force-dynamic";

// /company/studio/calendar — every dated post across LinkedIn, X and Reddit:
// what shipped, what's ready, what still needs your decision, and what the
// team has only planned so far.

export default function CalendarPage() {
  return (
    <div className="mx-auto max-w-6xl stagger-load">
      <PageHeader
        eyebrow="Content Studio"
        icon={<CalendarDays size={14} />}
        title="Calendar"
        description="Everything with a date on it, across all three platforms. Click any campaign item to open it in the Studio."
        actions={
          <Link
            href="/company/studio"
            className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={14} /> Studio
          </Link>
        }
      />
      <ContentCalendarView today={todayDate()} />
    </div>
  );
}
