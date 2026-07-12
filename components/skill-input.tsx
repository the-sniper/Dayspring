"use client";

// Tag/chip input with industry-skill autocomplete. Suggests from the local
// skill catalog as you type; Enter (or clicking "Add") accepts a custom skill
// that isn't in the list. Backspace on an empty input removes the last chip.
import { useMemo, useRef, useState } from "react";
import { X, Plus, Sparkles } from "lucide-react";
import { suggestSkills, isKnownSkill } from "@/lib/skills/catalog";
import { cn } from "@/lib/utils";

export default function SkillInput({
  items,
  onChange,
  placeholder = "Type a skill…",
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(
    () => (open ? suggestSkills(query, items, 8) : []),
    [query, items, open],
  );

  const trimmed = query.trim();
  const exists = items.some((s) => s.toLowerCase() === trimmed.toLowerCase());
  // Offer an explicit "add custom" row when the typed value isn't already a
  // suggestion and isn't already selected.
  const showCustom =
    trimmed.length > 0 &&
    !exists &&
    !suggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase());

  // Options the arrow keys / Enter cycle through (custom row last).
  const options = showCustom ? [...suggestions, trimmed] : suggestions;

  function add(skill: string) {
    const value = skill.trim();
    if (!value) return;
    if (!items.some((s) => s.toLowerCase() === value.toLowerCase())) {
      onChange([...items, value]);
    }
    setQuery("");
    setHighlight(0);
    setOpen(true);
    inputRef.current?.focus();
  }

  function remove(skill: string) {
    onChange(items.filter((s) => s !== skill));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(0, options.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const choice = options[highlight] ?? trimmed;
      if (choice) add(choice);
    } else if (e.key === "Backspace" && !query && items.length > 0) {
      remove(items[items.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-secondary/30 p-2 transition-all focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        {items.map((skill) => (
          <span
            key={skill}
            className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-xs font-bold text-foreground"
          >
            {skill}
            <button
              type="button"
              onClick={() => remove(skill)}
              title={`Remove ${skill}`}
              className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              <X size={12} strokeWidth={3} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={items.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      {open && options.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-xl border border-border bg-popover p-1 shadow-2xl shadow-black/20">
          {suggestions.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => add(s)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer",
                  highlight === i
                    ? "bg-brand-50 text-brand-900 dark:bg-brand-950/40 dark:text-brand-200"
                    : "text-foreground hover:bg-secondary",
                )}
              >
                <Sparkles size={13} className="shrink-0 text-brand-500" />
                {s}
              </button>
            </li>
          ))}
          {showCustom && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(suggestions.length)}
                onClick={() => add(trimmed)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer",
                  highlight === suggestions.length
                    ? "bg-brand-50 text-brand-900 dark:bg-brand-950/40 dark:text-brand-200"
                    : "text-foreground hover:bg-secondary",
                )}
              >
                <Plus size={13} className="shrink-0 text-emerald-500" />
                Add &ldquo;{trimmed}&rdquo;
                {!isKnownSkill(trimmed) && (
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                    custom
                  </span>
                )}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
