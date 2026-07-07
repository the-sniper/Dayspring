"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function Combobox({
  value,
  options,
  placeholder,
  onChange,
  inputClassName = "",
}: {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 50);
  }, [query, options]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [value]);

  function commit(v: string) {
    setQuery(v);
    setOpen(false);
    onChange(v);
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              commit(open && filtered[active] ? filtered[active] : query.trim());
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery(value);
            }
          }}
          className={cn(
            "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 pr-10",
            inputClassName
          )}
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={() => commit("")}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown 
            size={16} 
            className={cn("text-muted-foreground transition-transform duration-200", open && "rotate-180")} 
          />
        </div>
      </div>

      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 z-[100] mt-1 min-w-[240px] max-h-60 overflow-auto rounded-xl border border-border bg-popover py-1.5 text-sm shadow-xl shadow-black/5 dark:shadow-black/20"
          >
            {filtered.map((o, i) => (
              <li key={o}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "block w-full truncate px-3 py-2 text-left transition-colors",
                    i === active
                      ? "bg-brand-50 text-brand-900 dark:bg-brand-950/40 dark:text-brand-300"
                      : "text-foreground hover:bg-secondary"
                  )}
                >
                  {o}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
