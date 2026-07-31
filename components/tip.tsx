"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@heroui/react";

type TipProps = {
  label: string;
  children: ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  /** Hover delay in ms — much snappier than native `title` tooltips. */
  delay?: number;
};

// Instant-feel tooltips for icon buttons and truncated labels. Replaces slow,
// browser-native `title` attributes with HeroUI's portaled overlay.
export default function Tip({
  label,
  children,
  placement = "top",
  delay = 200,
}: TipProps) {
  return (
    <Tooltip delay={delay} closeDelay={0}>
      <Tooltip.Trigger className="inline-flex">{children}</Tooltip.Trigger>
      <Tooltip.Content placement={placement} showArrow>
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}
