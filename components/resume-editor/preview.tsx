"use client";

// Flicker-free live PDF preview. The next blob renders into an invisible
// buffer document; only once it has loaded do we swap it in and revoke the old
// URL — the current pages stay visible while the next version renders offscreen.
import { useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";
import type { ResumeDocType } from "@/lib/claude/resume";
import type { AuditHighlights } from "@/lib/resumes/audit-types";
import type { ResumeStyle } from "@/lib/resumes/style";
import { ResumePdf } from "@/lib/resumes/template";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Snapshot = { url: string; numPages: number };

// Render (off-DOM) and count pages — used by the "Fit to one page" loop.
export async function countPdfPages(
  doc: ResumeDocType,
  style: ResumeStyle,
): Promise<number> {
  const blob = await pdf(
    <ResumePdf doc={doc} style={style} showChanges={false} />,
  ).toBlob();
  const task = pdfjs.getDocument({ data: await blob.arrayBuffer() });
  try {
    const loaded = await task.promise;
    const n = loaded.numPages;
    await loaded.destroy();
    return n;
  } catch {
    return 1;
  }
}

export async function resumePdfBlob(
  doc: ResumeDocType,
  style: ResumeStyle,
): Promise<Blob> {
  return pdf(<ResumePdf doc={doc} style={style} showChanges={false} />).toBlob();
}

export default function ResumePreview({
  doc,
  style,
  highlights,
  showChanges,
  onPagesChange,
}: {
  doc: ResumeDocType;
  style: ResumeStyle;
  highlights: AuditHighlights;
  showChanges: boolean;
  onPagesChange?: (n: number) => void;
}) {
  // What's currently on screen (url + page count promoted together).
  const [display, setDisplay] = useState<Snapshot | null>(null);
  // Blob URL being parsed offscreen before promotion.
  const [backUrl, setBackUrl] = useState<string | null>(null);
  // Page count confirmed by the *visible* PdfDocument's onLoadSuccess — never
  // render PdfPage until this matches the loaded file (prevents "Invalid page
  // request" when the url swaps before pdf.js finishes parsing).
  const [renderPages, setRenderPages] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const genRef = useRef(0);
  const backUrlRef = useRef<string | null>(null);

  useEffect(() => {
    backUrlRef.current = backUrl;
  }, [backUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setWidth(Math.max(0, el.clientWidth - 32)),
    );
    ro.observe(el);
    setWidth(Math.max(0, el.clientWidth - 32));
    return () => ro.disconnect();
  }, []);

  const docKey = useMemo(() => JSON.stringify(doc), [doc]);
  const styleKey = useMemo(() => JSON.stringify(style), [style]);
  const hlKey = useMemo(
    () => (showChanges ? JSON.stringify(highlights) : "off"),
    [highlights, showChanges],
  );

  useEffect(() => {
    const gen = ++genRef.current;
    setRendering(true);
    const t = setTimeout(async () => {
      try {
        const blob = await pdf(
          <ResumePdf
            doc={doc}
            style={style}
            highlights={highlights}
            showChanges={showChanges}
          />,
        ).toBlob();
        if (genRef.current !== gen) return;
        setBackUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } catch {
        if (genRef.current === gen) setRendering(false);
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, styleKey, hlKey]);

  // Reset renderPages whenever the displayed blob changes so we never request
  // pages from the previous file while the new one is still parsing.
  useEffect(() => {
    setRenderPages(0);
  }, [display?.url]);

  function promoteBack(url: string, numPages: number) {
    // Ignore stale loads — a newer generation may have replaced backUrl.
    if (url !== backUrlRef.current) return;
    setDisplay((old) => {
      if (old?.url && old.url !== url) URL.revokeObjectURL(old.url);
      return { url, numPages };
    });
    setBackUrl(null);
    backUrlRef.current = null;
    setRendering(false);
  }

  const pageProps = {
    width: width || undefined,
    renderTextLayer: false,
    renderAnnotationLayer: false,
  };

  const showSpinner = !display || renderPages === 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto bg-secondary/40 p-4"
    >
      {rendering && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-foreground/70 px-2.5 py-1 text-[10px] font-bold text-background">
          <Loader2 size={11} className="animate-spin" />
          Updating
        </div>
      )}

      {display ? (
        <PdfDocument
          key={display.url}
          file={display.url}
          loading={null}
          error={null}
          className="flex flex-col items-center gap-4"
          onLoadSuccess={({ numPages }) => {
            setRenderPages(numPages);
            onPagesChange?.(numPages);
          }}
          onLoadError={() => {
            setRenderPages(0);
          }}
        >
          {renderPages > 0 &&
            Array.from({ length: renderPages }, (_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-md shadow-lg ring-1 ring-black/10"
              >
                <PdfPage pageNumber={i + 1} {...pageProps} loading={null} />
              </div>
            ))}
        </PdfDocument>
      ) : null}

      {showSpinner && (
        <div className="flex h-full min-h-[320px] items-center justify-center">
          <Loader2 size={22} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Invisible back buffer — promoted once pdf.js confirms page count. */}
      {backUrl && (
        <div className="pointer-events-none absolute inset-0 h-0 overflow-hidden opacity-0">
          <PdfDocument
            key={backUrl}
            file={backUrl}
            loading={null}
            error={null}
            onLoadSuccess={({ numPages }) => promoteBack(backUrl, numPages)}
            onLoadError={() => {
              if (backUrlRef.current === backUrl) {
                URL.revokeObjectURL(backUrl);
                backUrlRef.current = null;
                setBackUrl(null);
              }
              setRendering(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
