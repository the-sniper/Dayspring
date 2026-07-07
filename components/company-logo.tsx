import { cn } from "@/lib/utils";

const COLORS = [
  "bg-brand-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-amber-500",
];

export default function CompanyLogo({ 
  name, 
  className 
}: { 
  name: string; 
  className?: string;
}) {
  // Fast initials extraction
  const initials = (name[0] || "") + (name.split(" ")[1]?.[0] || "");
  const displayInitials = initials.toUpperCase().slice(0, 2);

  // Fast stable color selection
  const colorIndex = name.length % COLORS.length;
  const bgColor = COLORS[colorIndex];

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-bold text-white shadow-sm",
        bgColor,
        className
      )}
    >
      {displayInitials}
    </div>
  );
}
