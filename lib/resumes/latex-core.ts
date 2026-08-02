// The LaTeX tailoring pipeline: knowledge base + .tex template + JD → tailored
// .tex → compiled PDF, with the page count fed back for one repair pass.
//
// That feedback loop is the reason this exists. The old generator asked a model
// to hit a page target it could never measure, so "one page" meant "roughly one
// page, sometimes one and a half". Here the compiler reports the real number and
// the model gets one chance to fix it against a fact.
import {
  lengthModeLabel,
  headerLocationLine,
  tailorLatexResume,
  targetPages,
  type LengthMode,
  type TailoredLatexType,
} from "@/lib/claude/latex-resume";
import { MODEL_PREMIUM } from "@/lib/claude/client";
import { api, cleanDoc, convex, uploadPdfToStorage } from "@/lib/convex/server";
import { latestJobBrief } from "@/lib/research/core";
import { isHosted } from "@/lib/hosted";
import {
  compileLatex,
  detectEngine,
  lengthProblem,
  noEngineMessage,
  searchedLocations,
  serviceUrl,
} from "@/lib/resumes/latex";
import { getSetting, setSetting } from "@/lib/settings/store";

export const LATEX_TEMPLATE_KIND = "latex_template";
export const KNOWLEDGE_BASE_KIND = "knowledge_base";
export const LENGTH_MODE_SETTING = "resumeLengthMode";
// The header location line, before any relocation parenthetical.
export const BASE_LOCATION_SETTING = "resumeBaseLocation";
const DEFAULT_BASE_LOCATION = "Philadelphia, PA 19104";

export type ResumeAsset = { content: string; label: string | null; updatedAt: string };

export async function getAsset(kind: string): Promise<ResumeAsset | null> {
  const row = await convex().query(api.resumeAssets.get, { kind });
  return row ? { content: row.content, label: row.label, updatedAt: row.updatedAt } : null;
}

export async function saveAsset(
  kind: string,
  content: string,
  label?: string,
): Promise<void> {
  await convex().mutation(api.resumeAssets.upsert, { kind, content, label });
}

export async function assetSummary() {
  return convex().query(api.resumeAssets.summary, {});
}

export async function getDefaultLengthMode(): Promise<LengthMode> {
  return (await getSetting(LENGTH_MODE_SETTING)) === "two_page" ? "two_page" : "one_page";
}

export async function setDefaultLengthMode(mode: LengthMode): Promise<void> {
  await setSetting(LENGTH_MODE_SETTING, mode);
}

export async function getBaseLocation(): Promise<string> {
  return (await getSetting(BASE_LOCATION_SETTING)) || DEFAULT_BASE_LOCATION;
}

export type LatexGenerateResult = {
  id: string | null;
  latex: string;
  result: TailoredLatexType;
  // null when there's no TeX engine installed — the .tex is still returned.
  pages: number | null;
  compileError: string | null;
  lengthMode: LengthMode;
  attempts: number;
};

// Is the LaTeX path usable at all? Cheap enough to call on every page render.
export type LatexBackend = "service" | "local" | "none";

export async function latexReadiness(): Promise<{
  // Which backend will actually do the compiling.
  backend: LatexBackend;
  serviceUrl: string | null;
  hasTemplate: boolean;
  hasKnowledgeBase: boolean;
  engine: string | null;
  // Absolute path of a local engine, so "found" is verifiable at a glance
  // rather than something you have to trust. Null when the sidecar is in use.
  engineBin: string | null;
  // Operator-only diagnostics. Empty on a hosted deployment (a user there can't
  // install anything) and empty when the sidecar is configured (local paths
  // aren't what's running).
  searched: string[];
  hosted: boolean;
  ready: boolean;
}> {
  const service = serviceUrl();
  // Don't probe the local filesystem when the sidecar is the configured
  // backend — the answer wouldn't be used, and reporting a local engine that
  // isn't doing the work is worse than reporting nothing.
  const engine = service ? null : await detectEngine();
  const assets = await assetSummary();
  const kinds = new Set(assets.map((a) => a.kind));
  const hasTemplate = kinds.has(LATEX_TEMPLATE_KIND);
  const hasKnowledgeBase = kinds.has(KNOWLEDGE_BASE_KIND);
  const hosted = isHosted();
  return {
    backend: service ? "service" : engine ? "local" : "none",
    serviceUrl: service,
    engine: service ? "tectonic (service)" : (engine?.name ?? null),
    engineBin: engine?.bin ?? null,
    searched: hosted || service ? [] : searchedLocations(),
    hasTemplate,
    hasKnowledgeBase,
    hosted,
    // A missing engine is a degraded state, not a blocker: the .tex still
    // generates and can be compiled elsewhere (Overleaf, a laptop with MacTeX).
    ready: hasTemplate && hasKnowledgeBase,
  };
}

export async function generateLatexForJob(
  jobId: string,
  opts: { lengthMode?: LengthMode } = {},
): Promise<LatexGenerateResult> {
  const [template, kb] = await Promise.all([
    getAsset(LATEX_TEMPLATE_KIND),
    getAsset(KNOWLEDGE_BASE_KIND),
  ]);
  if (!template?.content.trim()) {
    throw new Error("No LaTeX template saved — add your .tex resume in Settings → Resume sources.");
  }
  if (!kb?.content.trim()) {
    throw new Error(
      "No Master Knowledge Base saved — add it in Settings → Resume sources. It's the source of truth the tailoring reads from.",
    );
  }

  const job = await convex().query(api.jobs.getWithCompany, { id: jobId as never });
  if (!job) throw new Error("Job not found");
  if (!job.description?.trim()) {
    throw new Error("This job has no description to tailor against — paste one in Edit Details.");
  }

  const lengthMode = opts.lengthMode ?? (await getDefaultLengthMode());
  const target = targetPages(lengthMode);
  const baseLocation = await getBaseLocation();
  const headerLocation = headerLocationLine(baseLocation, job.location ?? null);
  const brief = (await latestJobBrief(jobId))?.brief ?? null;

  const base = {
    template: template.content,
    knowledgeBase: kb.content,
    job: {
      title: job.title,
      companyName: job.companyName,
      location: job.location ?? null,
      description: job.description,
    },
    lengthMode,
    headerLocation,
    brief,
  };

  let { result } = await tailorLatexResume(base);
  let attempts = 1;
  let compiled = await compileLatex(result.latex);
  let compileError: string | null = null;

  // One repair pass, for whichever problem the compile surfaced. A second pass
  // rarely helps and doubles the cost of an already premium-tier call, so the
  // human gets the .tex and the honest note instead.
  const problem = !compiled.ok
    ? compiled.engine
      ? `The LaTeX did not compile. Fix this error and return the complete corrected document:\n${compiled.error}`
      : null // no engine installed — nothing to repair against
    : lengthProblem(compiled.pages, target);

  if (problem) {
    attempts = 2;
    const retry = await tailorLatexResume({
      ...base,
      repair: { previousLatex: result.latex, problem },
    });
    const recompiled = await compileLatex(retry.result.latex);
    // Keep the retry only if it actually improved things: a repair that breaks
    // a previously-compiling document is worse than the original.
    const betterNow =
      recompiled.ok &&
      (!compiled.ok ||
        Math.abs(recompiled.pages - target) <= Math.abs(compiled.pages - target));
    if (betterNow || !compiled.ok) {
      result = retry.result;
      compiled = recompiled;
    }
  }

  let pdfFileId: string | null = null;
  let pages: number | null = null;
  if (compiled.ok) {
    pages = compiled.pages;
    pdfFileId = await uploadPdfToStorage(compiled.pdf);
  } else {
    compileError = compiled.engine ? compiled.error : noEngineMessage(isHosted());
  }

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const fileName = `job-${jobId}-${slug(job.companyName)}-${slug(job.title)}-${Date.now()}.pdf`;

  const id = await convex().mutation(api.resumes.insertGenerated, {
    doc: cleanDoc({
      jobId,
      // `content` stays the human-readable payload for this row's format.
      content: result.latex,
      latex: result.latex,
      format: "latex",
      lengthMode,
      pages,
      pdfFileId,
      fileName: pdfFileId ? fileName : null,
      score: JSON.stringify(result.score),
      gaps: JSON.stringify({
        gaps: result.gaps,
        topBlockers: result.top_blockers,
        openQuestions: result.open_questions,
        lengthOutcome: result.length_outcome,
      }),
      tailoringNote: result.tailoring_note,
      model: MODEL_PREMIUM,
      createdAt: new Date().toISOString(),
    }),
  });

  return { id, latex: result.latex, result, pages, compileError, lengthMode, attempts };
}

// Re-compile a stored (or hand-edited) .tex without paying for another model
// call — the natural loop after tweaking one bullet.
export async function recompileStoredLatex(
  generatedId: string,
  latex: string,
): Promise<{ pages: number | null; error: string | null }> {
  const compiled = await compileLatex(latex);
  if (!compiled.ok) {
    return {
      pages: null,
      error: compiled.engine ? compiled.error : noEngineMessage(isHosted()),
    };
  }
  const pdfFileId = await uploadPdfToStorage(compiled.pdf);
  await convex().mutation(api.resumes.patchGenerated, {
    id: generatedId as never,
    patch: { latex, content: latex, pdfFileId, pages: compiled.pages },
  });
  return { pages: compiled.pages, error: null };
}

export function describeLength(pages: number | null, mode: LengthMode): string {
  const target = lengthModeLabel(mode);
  if (pages === null) return `${target} target — not compiled (no LaTeX engine)`;
  if (pages === targetPages(mode)) return `fills ${target}`;
  return `${pages} page${pages === 1 ? "" : "s"} — target was ${target}`;
}
