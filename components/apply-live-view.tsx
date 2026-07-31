"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";

// The embedded browser: renders the apply session's screencast frames and
// forwards clicks, scrolls, and keystrokes to the headless page — so the
// human can fix fields and solve CAPTCHAs without a separate window.
const FORWARDABLE_KEYS = new Set([
  "Enter", "Backspace", "Tab", "Delete", "Escape",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
]);

async function post(ev: Record<string, unknown>) {
  try {
    await fetch("/api/apply/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev),
    });
  } catch {
    // transient — next event will retry the connection
  }
}

export default function ApplyLiveView({ active }: { active: boolean }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [focused, setFocused] = useState(false);
  const textBuf = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWheel = useRef(0);

  // ~1.5 fps frame polling — enough to review a form, cheap on the server.
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/apply/frame?t=${Date.now()}`, { cache: "no-store" });
        if (stop) return;
        if (res.status === 200) {
          const w = Number(res.headers.get("X-Frame-Width"));
          const h = Number(res.headers.get("X-Frame-Height"));
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const img = imgRef.current;
          if (img) {
            const prev = img.src;
            img.src = url;
            if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
          } else {
            URL.revokeObjectURL(url);
          }
          if (w && h) setDims({ w, h });
          setHasFrame(true);
        }
      } catch {
        // server restarting / session gone — keep polling while active
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 700);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [active]);

  function pageCoords(e: React.MouseEvent): { x: number; y: number } | null {
    const img = imgRef.current;
    if (!img || !dims) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.round((e.clientX - rect.left) * (dims.w / rect.width)),
      y: Math.round((e.clientY - rect.top) * (dims.h / rect.height)),
    };
  }

  function flushText() {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (textBuf.current) {
      void post({ kind: "text", text: textBuf.current });
      textBuf.current = "";
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey) return; // let browser shortcuts through
    if (e.key.length === 1) {
      e.preventDefault();
      textBuf.current += e.key;
      if (!flushTimer.current) flushTimer.current = setTimeout(flushText, 150);
    } else if (FORWARDABLE_KEYS.has(e.key)) {
      e.preventDefault();
      flushText();
      void post({ kind: "key", key: e.key });
    }
  }

  if (!active) return null;

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> Live
        </span>
        <p className="text-[10px] font-medium text-muted-foreground">
          {focused
            ? "Typing goes to the page — click a field first."
            : "Click the page to interact (fix fields, solve CAPTCHAs)."}
        </p>
      </div>
      <div
        tabIndex={0}
        role="application"
        aria-label="Embedded application browser"
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          flushText();
          setFocused(false);
        }}
        className={cn(
          "max-h-[560px] overflow-hidden rounded-xl border bg-white outline-none transition-colors",
          focused ? "border-brand-500 ring-2 ring-brand-500/30" : "border-border",
        )}
      >
        {!hasFrame && (
          <div className="flex items-center justify-center gap-2 py-24 text-sm font-medium text-muted-foreground">
            <MonitorPlay size={16} /> Waiting for the browser stream…
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="Live application form"
          draggable={false}
          onClick={(e) => {
            (e.currentTarget.parentElement as HTMLElement)?.focus();
            const c = pageCoords(e);
            if (c) void post({ kind: "click", ...c });
          }}
          onWheel={(e) => {
            const now = Date.now();
            if (now - lastWheel.current < 120) return;
            lastWheel.current = now;
            const c = pageCoords(e);
            if (c) void post({ kind: "wheel", ...c, deltaY: Math.round(e.deltaY) });
          }}
          className={cn("w-full cursor-crosshair select-none", !hasFrame && "hidden")}
        />
      </div>
    </div>
  );
}
