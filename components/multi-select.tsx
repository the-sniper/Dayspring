"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export type MultiSelectOption = { value: string; label: string };

// Multi-value dropdown with checkbox toggles + chip display. Used by the feed
// filters for Location, Role, Workplace, and Job type. `searchable` adds a
// filter box (Location has ~1k options); the fixed-option filters omit it.
export default function MultiSelect({
  selected,
  options,
  placeholder = "Any",
  searchable = false,
  allowCustom = false,
  onChange,
}: {
  selected: string[];
  options: MultiSelectOption[];
  placeholder?: string;
  searchable?: boolean;
  allowCustom?: boolean;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const labelFor = useMemo(() => {
    const m = new Map(options.map((o) => [o.value, o.label]));
    return (v: string) => m.get(v) ?? v;
  }, [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) => o.label.toLowerCase().includes(q))
      : options;
    return list.slice(0, 50);
  }, [query, options]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    if (open && searchable) inputRef.current?.focus();
  }, [open, searchable]);

  function toggle(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
    setQuery("");
  }

  const triggerCls =
    "flex w-full min-h-[38px] items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground transition-all focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 cursor-pointer";

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={triggerCls}
      >
        <div className="flex flex-1 flex-wrap items-center gap-1 overflow-hidden">
          {selected.length === 0 ? (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          ) : (
            selected.map((v) => (
              <span
                key={v}
                className="flex max-w-full items-center gap-1 rounded-md bg-brand-50 py-0.5 pl-2 pr-1 text-xs font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
              >
                <span className="truncate">{labelFor(v)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${labelFor(v)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(selected.filter((x) => x !== v));
                  }}
                  className="rounded p-0.5 hover:bg-brand-100 dark:hover:bg-brand-900/50"
                >
                  <X size={11} />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 self-start pt-1">
          {selected.length > 0 && (
            <button
              type="button"
              aria-label="Clear all"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={16}
            className={cn(
              "text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 z-[100] mt-1 w-full min-w-[220px] rounded-xl border border-border bg-popover py-1.5 text-sm shadow-xl shadow-black/5 dark:shadow-black/20"
          >
            {searchable && (
              <div className="px-2 pb-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  placeholder="Search…"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActive((a) => Math.min(a + 1, filtered.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActive((a) => Math.max(a - 1, 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (filtered[active]) toggle(filtered[active].value);
                      else if (allowCustom && query.trim()) toggle(query.trim());
                    } else if (e.key === "Escape") {
                      setOpen(false);
                      setQuery("");
                    }
                  }}
                  className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            )}
            <ul role="listbox" aria-multiselectable className="max-h-60 overflow-auto">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-muted-foreground">No matches</li>
              )}
              {filtered.map((o, i) => {
                const isSel = selectedSet.has(o.value);
                return (
                  <li key={o.value} role="option" aria-selected={isSel}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        toggle(o.value);
                      }}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                        i === active
                          ? "bg-brand-50 text-brand-900 dark:bg-brand-950/40 dark:text-brand-300"
                          : "text-foreground hover:bg-secondary",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          isSel
                            ? "border-brand-500 bg-brand-500 text-white"
                            : "border-border",
                        )}
                      >
                        {isSel && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span className="truncate">{o.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
