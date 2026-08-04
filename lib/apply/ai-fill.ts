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

// Second belt for the DOM-position filter inside serializeEmptyFields: some
// boards render the site search outside any <header>/<nav> landmark.
const CHROME_FIELD_RX =
  /search|typeahead|typehead|keyword|save ?job|job ?alert|notified|newsletter|subscribe|ask anything|chat|cookie/i;

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
    // Site chrome is NOT the application. A career site's global "Search job
    // title" box is a plain type=text input that a model will happily fill with
    // the job title — and on typeahead-driven boards (Phenom) that navigates
    // the browser to a DIFFERENT requisition mid-run. Nothing outside the
    // application itself is fair game.
    const CHROME_CONTAINER =
      "header, nav, footer, [role=banner], [role=search], [role=navigation], [role=contentinfo]";
    const CHROME_LABEL =
      /search|typeahead|typehead|keyword|save ?job|job ?alert|notified|newsletter|subscribe|ask anything|chat|cookie|sign ?in|log ?in/i;
    // NOTE: no named function consts inside this callback. It is serialized
    // into the page, and a bundler that "keeps names" wraps them in a __name
    // helper that does not exist there — the whole pass then throws.
    const seenRadioGroups = new Set<string>();
    let i = 0;
    for (const el of Array.from(document.querySelectorAll("input, textarea, select"))) {
      const e = el as HTMLInputElement;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const type = (e.type || el.tagName).toLowerCase();
      // Checkboxes stay out on purpose: they are consent ("add me to the
      // Talent Community"), and consent is never something to auto-tick.
      if (["hidden", "submit", "button", "file", "checkbox", "password", "search"].includes(type)) continue;
      if (el.closest(CHROME_CONTAINER)) continue;
      // Radios were excluded outright, which meant a whole class of required
      // questions ("Have you ever worked here before?") could never be
      // answered by anything — not the answer bank, not the model, not saved
      // defaults. Serialize each GROUP once, with its options.
      if (type === "radio") {
        const groupName = e.name || "";
        if (!groupName || seenRadioGroups.has(groupName)) continue;
        seenRadioGroups.add(groupName);
        const group = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            `input[type=radio][name="${CSS.escape(groupName)}"]`,
          ),
        );
        const options: string[] = [];
        for (const r of group) {
          const viaFor = r.id
            ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.textContent ?? ""
            : "";
          const text = (viaFor || r.closest("label")?.textContent || r.value || "").trim();
          if (text) options.push(text.slice(0, 60));
        }
        // Finding the actual question is the hard part: Phenom's <legend> is a
        // boilerplate "You are applying for -", and the real text sits in a
        // sibling. So climb until an ancestor holds the whole group AND carries
        // text beyond the option labels, then subtract the options.
        let question = "";
        let node: HTMLElement | null = el.parentElement;
        for (let up = 0; up < 6 && node; up++, node = node.parentElement) {
          if (!group.every((g) => node!.contains(g))) continue;
          let text = (node.innerText || "").replace(/\s+/g, " ").trim();
          for (const r of group) {
            const viaFor = r.id
              ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.textContent ?? ""
              : "";
            const t = (viaFor || r.closest("label")?.textContent || r.value || "").trim();
            if (t) text = text.split(t).join(" ");
          }
          text = text.replace(/\s+/g, " ").trim();
          if (text.length >= 15) {
            question = text;
            break;
          }
        }
        if (!question) {
          const legend = el.closest("fieldset")?.querySelector("legend")?.textContent ?? "";
          question = (legend.trim().length >= 15 ? legend : groupName).trim();
        }
        const ref = `dsai-${i++}`;
        for (const r of group) r.setAttribute("data-dsai-group", ref);
        out.push({
          ref,
          tag: "radio",
          type: "radio",
          label: question.replace(/\s+/g, " ").slice(0, 140),
          options: options.slice(0, 12),
          value: group.some((r) => r.checked) ? "answered" : "",
        });
        continue;
      }
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
    .filter((f) => !CHROME_FIELD_RX.test(f.label)) // search boxes, alerts, chat
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
    if (field.tag === "radio") {
      // Pick the option in the group whose label matches; never guess when the
      // answer isn't one of the offered choices.
      const picked = await scope
        .locator(`[data-dsai-group="${field.ref}"]`)
        // No named helpers in here — see serializeEmptyFields.
        .evaluateAll((nodes: Element[], want: string) => {
          const target = want.trim().toLowerCase();
          for (const n of nodes) {
            const r = n as HTMLInputElement;
            const label =
              (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.textContent : "") ||
              r.closest("label")?.textContent ||
              r.value ||
              "";
            if (label.trim().toLowerCase() === target) {
              r.click();
              return true;
            }
          }
          return false;
        }, value)
        .catch(() => false);
      return picked;
    }
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
      // Education, employers, titles and dates live here and nowhere else —
      // application forms ask about all four.
      ctx.resumeText ? `Applicant résumé (verbatim):\n${ctx.resumeText.slice(0, 6000)}` : "",
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
