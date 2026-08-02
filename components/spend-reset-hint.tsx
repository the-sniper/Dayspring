"use client";

import { useEffect, useState } from "react";

// Cap is keyed by UTC date (`todayDate()`). Render the next midnight UTC in
// the viewer's local timezone so "resets" is meaningful without mental math.
function nextUtcMidnightLocal(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
    ),
  );
  return next.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function SpendResetHint() {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    setLocal(nextUtcMidnightLocal());
  }, []);

  return (
    <p className="mt-0.5">
      {local ? `Resets ${local}` : "Resets midnight UTC"}
    </p>
  );
}
