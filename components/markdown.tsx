import React from "react";

// Minimal markdown renderer for agent-written bodies (reports, briefs, memos).
// Zero dependencies, server- and client-safe. Covers what charters ask agents
// to produce: #/##/### headers, - lists, numbered lists, **bold**, `code`,
// [links](url). Everything else renders as paragraphs.

function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const rx = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/)[^)]+\))/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={key} className="font-semibold text-foreground">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("`")) {
      parts.push(
        <code
          key={key}
          className="rounded bg-secondary px-1 font-mono text-[0.85em] text-foreground"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      const mm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (mm) {
        parts.push(
          <a
            key={key}
            href={mm[2]}
            target="_blank"
            rel="noreferrer"
            className="text-brand-600 hover:underline dark:text-brand-400"
          >
            {mm[1]}
          </a>,
        );
      } else {
        parts.push(tok);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];

  const flush = () => {
    if (list.length) {
      out.push(
        <ul
          key={`ul-${out.length}`}
          className="my-1.5 flex list-disc flex-col gap-0.5 pl-5"
        >
          {list}
        </ul>,
      );
      list = [];
    }
  };

  text.split("\n").forEach((line, idx) => {
    const t = line.trim();
    const li = t.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
    if (li) {
      list.push(<li key={`li-${idx}`}>{inline(li[1], `li-${idx}`)}</li>);
      return;
    }
    flush();
    if (!t) return;
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      out.push(
        <p
          key={`h-${idx}`}
          className={
            h[1].length <= 2
              ? "mb-1 mt-3 text-sm font-bold text-foreground first:mt-0"
              : "mb-0.5 mt-2.5 text-[13px] font-bold text-foreground first:mt-0"
          }
        >
          {inline(h[2], `h-${idx}`)}
        </p>,
      );
      return;
    }
    out.push(
      <p key={`p-${idx}`} className="my-1">
        {inline(t, `p-${idx}`)}
      </p>,
    );
  });
  flush();

  return (
    <div className="text-[13px] leading-relaxed text-foreground/90">{out}</div>
  );
}
