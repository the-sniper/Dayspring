import { z } from "zod";
import type { Page } from "playwright";
import type { ApplyContext } from "@/lib/apply/core";
import {
  fillSticky,
  formScope,
  tryComboSelect,
  type FormScope,
} from "@/lib/apply/ats-forms";
import { loadSavedAnswers, lookupAnswer } from "@/lib/apply/answers";
import { getProfile } from "@/lib/jobs/score";

// AI fallback fill: after the deterministic selector pass, serialize the
// visible fields that are still empty and ask a cheap model to map profile
// facts onto them in ONE structured call (no agent loop). Strictly grounded:
// unanswerable fields are omitted, demographic/EEO questions are filtered
// out BEFORE the model ever sees them, and the human reviews everything at
// the approval gate — same as hand-typed answers.

const EEO_RX =
  /gender|race|ethnic|veteran|disab|sexual orientation|lgbt|pronoun|transgender|self[- ]?identif|demographic/i;

const Mapping = z.object({
  fills: z.array(
    z.object({
      ref: z.string(),
      value: z.string(),
    }),
  ),
});

export type SerializedField = {
  ref: string;
  tag: string;
  type: string;
  label: string;
  options?: string[];
  value: string;
};

// Exported for the MCP apply loop (lib/apply/session.ts), which snapshots the
// form, decides one field at a time, and re-snapshots to see what actually
// stuck — the thing this module's single-shot mapping call cannot do.
export async function serializeEmptyFields(page: FormScope): Promise<SerializedField[]> {
  const raw = await page.evaluate(() => {
    const out: {
      ref: string;
      tag: string;
      type: string;
      label: string;
      options?: string[];
      value: string;
    }[] = [];
    let i = 0;
    for (const el of Array.from(document.querySelectorAll("input, textarea, select"))) {
      const e = el as HTMLInputElement;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const type = (e.type || el.tagName).toLowerCase();
      if (["hidden", "submit", "button", "file", "checkbox", "radio", "password", "search"].includes(type)) continue;
      // Label discovery: <label for> beats aria/placeholder for boards like
      // Greenhouse's, whose comboboxes carry no aria-label.
      let label = "";
      if (e.id) {
        label = document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent?.trim() ?? "";
      }
      if (!label) label = e.getAttribute("aria-label") || e.getAttribute("placeholder") || "";
      if (!label) label = e.closest("label")?.textContent?.trim() || e.name || "";
      const ariaAuto = e.getAttribute("aria-autocomplete");
      const isCombo =
        e.getAttribute("role") === "combobox" || ariaAuto === "list" || ariaAuto === "both";
      const ref = `dsai-${i++}`;
      el.setAttribute("data-dsai", ref);
      let value = (e.value ?? "").trim();
      if (isCombo && !value) {
        // A chosen combobox value renders in a SIBLING of the input's
        // container — closest must target the value-container specifically.
        const container =
          el.closest('[class*="select__value-container"]') ??
          el.parentElement?.parentElement ?? null;
        const single = container?.querySelector('[class*="single-value"]');
        value = single?.textContent?.trim() ?? "";
      }
      out.push({
        ref,
        tag: isCombo ? "combobox" : el.tagName.toLowerCase(),
        type,
        label: label.replace(/\s+/g, " ").slice(0, 140),
        options:
          el.tagName === "SELECT"
            ? Array.from((el as unknown as HTMLSelectElement).options)
                .map((o) => o.text.trim())
                .filter(Boolean)
                .slice(0, 30)
            : undefined,
        value,
      });
    }
    return out;
  });
  return raw
    .filter((f) => !f.value) // deterministic pass (or the site) already filled it
    .filter((f) => f.label && !EEO_RX.test(f.label)) // EEO never reaches the model
    .slice(0, 25);
}

// One field write, honoring the widget type. Returns true when the value took.
export async function writeField(
  scope: FormScope,
  field: SerializedField,
  value: string,
): Promise<boolean> {
  const el = scope.locator(`[data-dsai="${field.ref}"]`).first();
  try {
    if (field.tag === "combobox") {
      return await tryComboSelect(scope, el, value);
    }
    if (field.tag === "select") {
      if (!field.options?.includes(value)) return false; // not a real option
      await el.selectOption({ label: value }, { timeout: 2000 });
      return true;
    }
    return await fillSticky(el, value.slice(0, 400));
  } catch {
    return false;
  }
}

export async function aiFillRemaining(
  page: Page,
  ctx: ApplyContext,
  opts: { timeoutMs?: number; isAborted?: () => boolean } = {},
): Promise<{ filled: string[]; fromMemory: string[] }> {
  const scope = await formScope(page); // the form may live inside an iframe
  let fields = await serializeEmptyFields(scope);
  if (fields.length === 0) return { filled: [], fromMemory: [] };

  // Answer bank first: questions the user has answered on past applications
  // get their remembered answer verbatim — no model call, no ambiguity. Exact
  // question text is tried first, then a meaning-class match so a reworded
  // version of the same question still hits. Answers that are about a specific
  // employer are excluded by loadSavedAnswers and never reach this loop.
  const saved = await loadSavedAnswers();
  const fromMemory: string[] = [];
  if (saved.byKey.size > 0 || saved.byClass.size > 0) {
    for (const field of fields) {
      if (opts.isAborted?.()) break;
      const hit = lookupAnswer(saved, field.label);
      if (!hit) continue;
      if (await writeField(scope, field, hit.answer)) {
        fromMemory.push(
          hit.via === "class"
            ? `${field.label.slice(0, 40)} (matched)`
            : field.label.slice(0, 40),
        );
        field.value = hit.answer; // mark handled
      }
    }
    fields = fields.filter((f) => !f.value);
    if (fields.length === 0) return { filled: [], fromMemory };
  }

  const { hasApiKey } = await import("@/lib/claude/client");
  if (!(await hasApiKey()) || opts.isAborted?.()) return { filled: [], fromMemory };

  const profile = ((await getProfile()) ?? "").slice(0, 4000);
  const { structuredComplete } = await import("@/lib/ai/complete");

  // The SDK's default request timeout is minutes long with retries — a slow
  // or rate-limited call must not wedge the session, so race a hard cap.
  const timeoutMs = opts.timeoutMs ?? 45_000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const mapping = structuredComplete({
    tier: "cheap",
    schema: Mapping,
    schemaName: "form_fill_mapping",
    maxTokens: 1500,
    system: `You map a job applicant's known facts onto empty application-form fields.
Rules (strict):
- Use ONLY facts stated in the applicant data below. If a field can't be answered from it, OMIT that field entirely — never guess, never invent.
- For "select" fields the value MUST be EXACTLY one of the listed options (verbatim).
- "combobox" fields are type-ahead dropdowns whose options are hidden — answer with the shortest likely option text (e.g. "Yes", "No", "United States"); it will only be applied if a matching option exists.
- Free-text answers: concise, first person, max 400 characters.
- Never answer demographic, self-identification, or legal-attestation questions.
- Return one entry per field you can confidently fill, keyed by its ref.`,
    user: [
      `Job: ${ctx.job.title} at ${ctx.job.companyName}`,
      `Applicant contact fields: ${JSON.stringify(ctx.fields)}`,
      ctx.defaults ? `Applicant's stated application defaults: ${JSON.stringify(ctx.defaults)}` : "",
      `Applicant profile:\n${profile}`,
      ctx.job.tailoredBullets?.length
        ? `Tailored talking points for this job:\n- ${ctx.job.tailoredBullets.join("\n- ")}`
        : "",
      `Empty form fields:\n${JSON.stringify(fields, null, 1)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  let data: z.infer<typeof Mapping>;
  try {
    ({ data } = await Promise.race([
      mapping,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("ai-fill timed out")), timeoutMs);
      }),
    ]));
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (opts.isAborted?.()) return { filled: [], fromMemory };

  const byRef = new Map(fields.map((f) => [f.ref, f]));
  const filled: string[] = [];
  for (const fill of data.fills) {
    const field = byRef.get(fill.ref);
    if (!field || !fill.value.trim()) continue;
    if (opts.isAborted?.()) break;
    if (await writeField(scope, field, fill.value.trim())) {
      filled.push(field.label.slice(0, 40));
    }
  }
  return { filled, fromMemory };
}
