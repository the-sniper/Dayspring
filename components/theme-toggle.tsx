"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Switch } from "@heroui/react";
import { cn } from "@/lib/utils";

function applyTheme(dark: boolean) {
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.setAttribute("data-theme", dark ? "dark" : "light");
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    /* localStorage may be unavailable */
  }
}

export default function ThemeToggle({ inverse = false }: { inverse?: boolean }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "h-[46px] w-full animate-pulse rounded-xl",
          inverse ? "bg-white/10" : "bg-secondary/50",
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 max-sm:justify-center",
        inverse
          ? "border border-white/10 bg-white/[0.04]"
          : "border border-border/70 bg-surface/60 backdrop-blur-sm",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2.5 text-sm font-medium max-sm:hidden",
          inverse ? "text-[#f7f3ec]/80" : "text-foreground",
        )}
      >
        {dark ? (
          <Moon size={16} className="text-brand-400" />
        ) : (
          <Sun size={16} className="text-brand-500" />
        )}
        {dark ? "Dark" : "Light"}
      </span>
      <Switch
        aria-label="Toggle dark mode"
        isSelected={dark}
        onChange={(v) => {
          setDark(v);
          applyTheme(v);
        }}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  );
}
