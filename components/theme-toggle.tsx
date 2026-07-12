"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Switch } from "@heroui/react";

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

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  if (!mounted) {
    return <div className="h-[46px] w-full rounded-xl bg-secondary/50 animate-pulse" />;
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface/60 px-3 py-2.5 backdrop-blur-sm">
      <span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
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
