"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    /* localStorage may be unavailable */
  }
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    setDark((prev) => {
      const next = !prev;
      applyTheme(next);
      return next;
    });
  }

  if (!mounted) return <div className="h-10 w-full rounded-lg bg-secondary/50 animate-pulse" />;

  return (
    <button
      type="button"
      onClick={toggle}
      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
    >
      <div className="relative flex h-5 w-5 items-center justify-center">
        {dark ? (
          <Sun size={18} className="text-brand-500 transition-all group-hover:rotate-45" />
        ) : (
          <Moon size={18} className="text-stone-500 transition-all group-hover:-rotate-12" />
        )}
      </div>
      <span>{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
