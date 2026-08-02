import { cn } from "@/lib/utils";

type EmployeeAvatarProps = {
  name: string;
  avatar?: string;
  avatarFocus?: string;
  avatarZoom?: number;
  className?: string;
  imageClassName?: string;
  muted?: boolean;
};

// A shared portrait treatment keeps employee identity consistent in the chart,
// directory, and detail pages. DiceBear URLs are deterministic per employee:
// no account, cookies, or random avatar changes between renders.
export default function EmployeeAvatar({
  name,
  avatar,
  avatarFocus = "50% 35%",
  avatarZoom = 1.2,
  className,
  imageClassName,
  muted = false,
}: EmployeeAvatarProps) {
  return (
    <span
      className={cn(
        "relative isolate flex shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-amber-200 via-orange-50 to-rose-100 shadow-[0_10px_20px_-10px_rgba(245,158,11,0.7)] ring-1 ring-white/80 dark:ring-white/10",
        muted && "grayscale opacity-70",
        className,
      )}
    >
      {avatar ? (
        // Source art varies from tight headshots to full promotional stills.
        // Per-employee focal points keep every crop composed as a portrait.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={`${name}'s avatar`}
          referrerPolicy="no-referrer"
          className={cn(
            "h-full w-full origin-center object-cover transition-transform duration-200 ease-out",
            imageClassName,
          )}
          style={{
            objectPosition: avatarFocus,
            transform: `scale(${avatarZoom})`,
          }}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-400 to-brand-600 font-display text-sm font-bold text-white">
          {name[0]}
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/5 dark:ring-white/10" />
    </span>
  );
}
