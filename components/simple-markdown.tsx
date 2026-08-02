import { cn } from "@/lib/utils";

// Lightweight markdown for orchestra briefs/reports (controlled format):
// #/##/### headings, - bullets, **bold**, `code`. No dependency.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="font-semibold text-foreground">$1</strong>',
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-secondary px-1 py-0.5 font-mono text-[0.9em] text-foreground">$1</code>',
    );
}

export default function SimpleMarkdown({
  source,
  className,
  compact,
}: {
  source: string;
  className?: string;
  /** Tighter type for nested panels (artifacts, retros). */
  compact?: boolean;
}) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  return (
    <div className={cn("space-y-0", className)}>
      {lines.map((line, i) => {
        if (line.trim() === "") {
          return <div key={i} className={compact ? "h-1.5" : "h-2"} />;
        }

        const h = line.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
          const level = h[1]!.length;
          const Tag = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
          return (
            <Tag
              key={i}
              className={cn(
                "font-semibold tracking-tight text-foreground",
                compact ? "mt-3 first:mt-0 text-sm" : "mt-4 first:mt-0 text-base",
                level >= 3 && "text-sm font-medium text-foreground/90",
              )}
              dangerouslySetInnerHTML={{ __html: inlineHtml(h[2]!) }}
            />
          );
        }

        // Attention banners the report assembler prefixes with >>>
        if (line.startsWith(">>>") && line.endsWith("<<<")) {
          return (
            <p
              key={i}
              className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-900 dark:text-amber-100"
            >
              {line.replace(/^>>>\s*/, "").replace(/\s*<<<$/, "")}
            </p>
          );
        }

        const bullet = line.match(/^\s*[-*]\s+(.*)/);
        if (bullet) {
          return (
            <p
              key={i}
              className={cn(
                "relative pl-4 leading-relaxed text-muted-foreground before:absolute before:left-1 before:text-brand-500 before:content-['·']",
                compact ? "text-xs" : "text-sm",
              )}
              dangerouslySetInnerHTML={{ __html: inlineHtml(bullet[1]!) }}
            />
          );
        }

        // Lead meta lines (ORCHESTRA date, VERIFIED, Spend) — slightly quieter
        const isMeta =
          /^(ORCHESTRA|Radar's brief|Compass:|Herald:|Spend:|Sentinel)/i.test(
            line,
          );

        return (
          <p
            key={i}
            className={cn(
              "leading-relaxed",
              compact ? "text-xs" : "text-sm",
              isMeta
                ? "font-medium text-foreground/80"
                : "text-muted-foreground",
            )}
            dangerouslySetInnerHTML={{ __html: inlineHtml(line) }}
          />
        );
      })}
    </div>
  );
}
